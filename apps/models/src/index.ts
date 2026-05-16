import type { ApiError, RequestLogger } from "@cf-workers/helpers";
import {
  createError,
  createPingPongRoute,
  createViewSourceRedirect,
  deleteRequestLogger,
  getRequestLogger,
  setRequestLogger,
  toLogError,
} from "@cf-workers/helpers";
import {
  generateText,
  Output,
  AISDKError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
} from "ai";
import { createWorkersLogger, initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createWorkersAI, type WorkersAI } from "workers-ai-provider";
import { z } from "zod";

initWorkersLogger({
  env: { service: "models" },
});

interface HonoContext {
  Bindings: CloudflareBindings;
}

const TEXT_ENCODER = new TextEncoder();
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
const DISALLOWED_SCOPES = new Set(["pr", "pullrequest", "github", "automation", "schema"]);
const PR_METADATA_RESPONSE_SCHEMA = z.object({
  type: z.enum(["docs", "feat", "fix", "chore"]),
  scope: z.string(),
  message: z.string(),
  body: z.string(),
});
const PR_METADATA_REQUEST_BODY_SCHEMA = z.object({
  diff: z.string().min(1),
  system: z.string().min(1).optional(),
  repository: z.string().regex(/^luxass\/.+$/),
  context: z.string().min(1),
});

const DEFAULT_PR_METADATA_SYSTEM_PROMPT = `You generate conventional commit metadata for automated pull requests.

You will receive a git diff plus repository context. Analyze it and return:
- type: "docs" if only documentation, comments, or descriptions changed, "feat" if user-facing functionality was added, "fix" if behavior was corrected, "chore" for maintenance or anything else.
- scope: the most relevant package, module, feature, or area being changed. For github-schema, prefer the most specific changed GraphQL type or input name when exactly one clear target exists. Do not use generic scopes such as "pull request", "pr", "github", "automation", or "schema". Return an empty string if multiple types are changed or no single scope is clearly dominant.
- message: a concise imperative-mood description under 72 characters.
- body: a short markdown bullet list summarizing what changed.`;
const STRICT_JSON_FALLBACK_INSTRUCTION = `Return exactly one JSON object matching the requested schema.
Do not return markdown.
Do not use code fences.
Do not use bullet points.
Do not include any explanatory text before or after the JSON object.`;

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("models"));
app.get("/ping", createPingPongRoute());

function encodeText(value: string): ArrayBuffer {
  const bytes = TEXT_ENCODER.encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

async function verifySignature(
  secret: string,
  payload: string,
  signatureHex: string,
): Promise<boolean> {
  if (!/^[\da-f]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) {
    return false;
  }

  const signature = new ArrayBuffer(signatureHex.length / 2);
  const signatureBytes = new Uint8Array(signature);

  for (let index = 0; index < signatureHex.length; index += 2) {
    signatureBytes[index / 2] = Number.parseInt(signatureHex.slice(index, index + 2), 16);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encodeText(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("HMAC", key, signature, encodeText(payload));
}

function normalizeScope(scope: string): string {
  const normalized = scope.trim();

  if (!normalized) {
    return "";
  }

  const comparable = normalized.toLowerCase().replaceAll(/[\s_-]+/g, "");

  return DISALLOWED_SCOPES.has(comparable) ? "" : normalized;
}

function normalizePrMetadata(output: z.infer<typeof PR_METADATA_RESPONSE_SCHEMA>) {
  return {
    ...output,
    scope: normalizeScope(output.scope),
  };
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

async function generatePrMetadata(
  workersAi: WorkersAI,
  model: string,
  system: string,
  prompt: string,
  log: RequestLogger | undefined,
) {
  try {
    const result = await generateText({
      model: workersAi(model),
      system,
      temperature: 1,
      output: Output.object({
        schema: PR_METADATA_RESPONSE_SCHEMA,
      }),
      prompt,
    });

    return normalizePrMetadata(result.output);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      log?.error(err, {
        message: "Structured PR metadata generation failed; retrying with plain JSON fallback",
        model,
        aiCause: err.cause ?? null,
        aiText:
          typeof err.text === "string"
            ? err.text.length > 2000
              ? `${err.text.slice(0, 2000)}…`
              : err.text
            : null,
        aiResponse: err.response ?? null,
        aiUsage: err.usage ?? null,
        aiFinishReason: err.finishReason ?? null,
      });
    } else if (NoOutputGeneratedError.isInstance(err)) {
      log?.error(err, {
        message:
          "Structured PR metadata generation produced no output; retrying with plain JSON fallback",
        model,
        aiCause: err.cause ?? null,
      });
    } else if (AISDKError.isInstance(err)) {
      log?.error(err, {
        message:
          "Structured PR metadata generation failed with AI SDK error; retrying with plain JSON fallback",
        model,
        aiCause: err.cause ?? null,
      });
    } else {
      log?.error(toLogError(err), {
        message: "Structured PR metadata generation failed; retrying with plain JSON fallback",
        model,
      });
    }

    const fallback = await generateText({
      model: workersAi(model),
      system: `${system}\n\n${STRICT_JSON_FALLBACK_INSTRUCTION}`,
      temperature: 1,
      prompt: `${prompt}\n\nReturn only a JSON object.`,
    });

    const fallbackText = extractJsonObject(fallback.text);
    const parsed = PR_METADATA_RESPONSE_SCHEMA.safeParse(JSON.parse(fallbackText));

    if (parsed.success) {
      return normalizePrMetadata(parsed.data);
    }

    log?.error(new Error("Fallback PR metadata response failed schema validation"), {
      message: "Fallback PR metadata response failed schema validation",
      model,
      fallbackText: fallbackText.length > 2000 ? `${fallbackText.slice(0, 2000)}…` : fallbackText,
      schemaIssues: parsed.error.issues,
    });

    throw err;
  }
}

app.post("/api/pr-metadata", async (c) => {
  const log = getRequestLogger(c.req.raw);

  const timestampHeader = c.req.header("x-timestamp");
  const signatureHeader = c.req.header("x-signature");

  if (!timestampHeader || !signatureHeader) {
    return createError(c, 401, "Missing HMAC headers");
  }

  const timestampMs = Number(timestampHeader);

  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > MAX_REQUEST_AGE_MS
  ) {
    return createError(c, 401, "Expired or invalid timestamp");
  }

  const rawBody = await c.req.raw.text();

  const isValidSignature = await verifySignature(
    c.env.HMAC_SECRET,
    `${timestampHeader}.${rawBody}`,
    signatureHeader,
  );

  if (!isValidSignature) {
    return createError(c, 401, "Invalid signature");
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return createError(c, 400, "Invalid JSON body");
  }

  const body = PR_METADATA_REQUEST_BODY_SCHEMA.safeParse(parsedBody);

  if (!body.success) {
    return createError(c, 400, body.error.issues[0]?.message ?? "Invalid request body");
  }

  const model = c.env.DEFAULT_MODEL;

  const workersAi = createWorkersAI({
    binding: c.env.AI,
  });

  log?.set({
    message: "Generating PR metadata via AI SDK",
    model,
  });

  const prompt = [
    "Please analyze this git diff and generate appropriate PR metadata.",
    `Repository: ${body.data.repository}`,
    `Additional context:\n${body.data.context}`,
    `\`\`\`diff\n${body.data.diff}\n\`\`\``,
  ].join("\n\n");

  const result = await generatePrMetadata(
    workersAi,
    model as string,
    body.data.system ?? DEFAULT_PR_METADATA_SYSTEM_PROMPT,
    prompt,
    log,
  );

  log?.set({
    message: "Generated PR metadata successfully",
    metadata: result,
  });

  return c.json(result);
});

app.onError(async (err, c) => {
  const log = getRequestLogger(c.req.raw);

  log?.error(err, {
    message: "Models request failed",
  });

  const url = new URL(c.req.url);

  if (err instanceof HTTPException) {
    return c.json(
      {
        path: url.pathname,
        status: err.status,
        message: err.message,
        timestamp: new Date().toISOString(),
      } satisfies ApiError,
      err.status,
    );
  }

  return c.json(
    {
      path: url.pathname,
      status: 500,
      message: "Internal server error",
      timestamp: new Date().toISOString(),
    } satisfies ApiError,
    500,
  );
});

app.notFound((c) => createError(c, 404, "Not found"));

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    executionCtx: ExecutionContext,
  ): Promise<Response> {
    const log = setRequestLogger(request, createWorkersLogger(request));

    log.set({
      message: "received models request",
    });

    try {
      const response = await app.fetch(request, env, executionCtx);

      log.set({
        response: {
          status: response.status,
        },
      });

      log.emit();

      return response;
    } catch (err) {
      log.error(toLogError(err));
      log.emit();

      throw err;
    } finally {
      deleteRequestLogger(request);
    }
  },
};
