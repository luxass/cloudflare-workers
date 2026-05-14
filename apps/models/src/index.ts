import type { ApiError } from "@cf-workers/helpers";
import {
  createError,
  createPingPongRoute,
  createViewSourceRedirect,
  deleteRequestLogger,
  getRequestLogger,
  setRequestLogger,
  toLogError,
} from "@cf-workers/helpers";
import { generateText, Output } from "ai";
import { createWorkersLogger, initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

initWorkersLogger({
  env: { service: "models" },
});

interface HonoContext {
  Bindings: CloudflareBindings;
}

const textEncoder = new TextEncoder();
const maxRequestAgeMs = 5 * 60 * 1000;

const PR_METADATA_RESPONSE_SCHEMA = z.object({
  type: z.enum(["docs", "feat", "fix", "chore"]),
  scope: z.string(),
  message: z.string(),
  body: z.string(),
});

const PR_METADATA_REQUEST_BODY_SCHEMA = z.object({
  diff: z.string().min(1),
  maxTokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  system: z.string().min(1).optional(),
  repository: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
});

const DEFAULT_PR_METADATA_SYSTEM_PROMPT = `You generate conventional commit metadata for automated pull requests.

You will receive a git diff and optional repository context. Analyze it and return:
- type: "docs" if only documentation, comments, or descriptions changed, "feat" if user-facing functionality was added, "fix" if behavior was corrected, "chore" for maintenance or anything else.
- scope: the most relevant package, module, feature, or area being changed. Empty string if there is no clear single scope.
- message: a concise imperative-mood description under 72 characters.
- body: a short markdown bullet list summarizing what changed.`;

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("models"));
app.get("/ping", createPingPongRoute());

function parseTimestamp(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const timestampMs = Number.parseInt(value, 10);

  return Number.isSafeInteger(timestampMs) ? timestampMs : null;
}

function encodeText(value: string): ArrayBuffer {
  const bytes = textEncoder.encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function decodeHex(value: string): ArrayBuffer | null {
  if (!/^[\da-f]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return buffer;
}

async function verifySignature(
  secret: string,
  payload: string,
  signatureHex: string,
): Promise<boolean> {
  const signature = decodeHex(signatureHex);

  if (!signature) {
    return false;
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

app.post("/api/pr-metadata", async (c) => {
  const log = getRequestLogger(c.req.raw);

  const timestampHeader = c.req.header("x-timestamp");
  const signatureHeader = c.req.header("x-signature");

  if (!timestampHeader || !signatureHeader) {
    return createError(c, 401, "Missing HMAC headers");
  }

  const timestampMs = parseTimestamp(timestampHeader);

  if (
    timestampMs === null
    || Math.abs(Date.now() - timestampMs) > maxRequestAgeMs
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
    return createError(
      c,
      400,
      body.error.issues[0]?.message ?? "Invalid request body",
    );
  }

  const model = c.env.DEFAULT_MODEL;

  const workersAi = createWorkersAI({
    binding: c.env.AI,
  });

  log?.set({
    message: "Generating PR metadata via AI SDK",
    model,
  });

  const parts = ["Please analyze this git diff and generate appropriate PR metadata."];

  if (body.data.repository) {
    parts.push(`Repository: ${body.data.repository}`);
  }

  if (body.data.context) {
    parts.push(`Additional context:\n${body.data.context}`);
  }

  parts.push(`\`\`\`diff\n${body.data.diff}\n\`\`\``);

  const prompt = parts.join("\n\n");

  const result = await generateText({
    model: workersAi(model as string),
    system: body.data.system ?? DEFAULT_PR_METADATA_SYSTEM_PROMPT,
    temperature: body.data.temperature,
    output: Output.object({
      schema: PR_METADATA_RESPONSE_SCHEMA,
    }),
    prompt: prompt,
  });

  return c.json(result.output);
});

app.onError(async (err, c) => {
  const log = getRequestLogger(c.req.raw);

  log?.error(toLogError(err), {
    message: "Models request failed",
  });

  const url = new URL(c.req.url);

  if (err instanceof HTTPException) {
    return c.json({
      path: url.pathname,
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    }, err.status);
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  });
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
      message: "Handling models request",
      environment: env.ENVIRONMENT ?? "local",
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
    } catch (error) {
      log.error(toLogError(error));
      log.emit();

      throw error;
    } finally {
      deleteRequestLogger(request);
    }
  },
};
