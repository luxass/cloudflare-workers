import type { ApiError, RequestLogger } from "@cf-workers/helpers";
import {
  createError,
  createPingPongRoute,
  createViewSourceRedirect,
  deleteRequestLogger,
  getRequestLogger,
  setRequestLogger,
  toLogError,
  verifyHmacSignature,
} from "@cf-workers/helpers";
import { generateText, Output, AISDKError, NoObjectGeneratedError } from "ai";
import { createWorkersLogger, initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createWorkersAI, type WorkersAI } from "workers-ai-provider";
import { z } from "zod";

import {
  DEFAULT_PR_METADATA_MODEL,
  PR_METADATA_MODELS,
  type PrMetadataModel,
} from "./pr-metadata-models";
import {
  PR_METADATA_OUTPUT_SCHEMA,
  PrMetadataValidationError,
  parsePrMetadata,
  type PrMetadata,
} from "./pr-metadata-output";
import { buildPrMetadataSystemPrompt, buildPrMetadataUserPrompt } from "./pr-metadata-prompt";

initWorkersLogger({
  env: { service: "models" },
});

interface HonoContext {
  Bindings: Env;
}

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
const timestampSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .refine(Number.isSafeInteger)
  .refine((timestamp) => Math.abs(Date.now() - timestamp) <= MAX_REQUEST_AGE_MS);
// Strict: unknown fields, including the removed `system` override, are rejected instead of ignored.
const PR_METADATA_REQUEST_BODY_SCHEMA = z.strictObject({
  repository: z.string().regex(/^luxass\/[\w.-]+$/),
  diff: z.string().min(1).max(100_000),
  // Repository instructions appended to the built-in prompt. An empty string means none.
  context: z.string().trim().max(4_000).optional(),
  model: z.enum(PR_METADATA_MODELS).optional(),
});

const STRICT_JSON_FALLBACK_INSTRUCTION = `Return exactly one JSON object matching the requested schema.
Do not return markdown.
Do not use code fences.
Do not include any explanatory text before or after the JSON object.`;

/** Thrown when no generation attempt produced valid PR metadata. The route answers 502. */
class PrMetadataGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PrMetadataGenerationError";
  }
}

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("models"));
app.get("/ping", createPingPongRoute());

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

function truncateForLog(text: string): string {
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

type PrMetadataGeneration = {
  metadata: PrMetadata;
  generationMode: "structured" | "plain-json-fallback";
};

/**
 * Generates PR metadata with structured output, then retries once with plain JSON.
 * The retry also runs when structured output succeeds but fails the content rules.
 */
async function generatePrMetadata(
  workersAi: WorkersAI,
  model: PrMetadataModel,
  system: string,
  prompt: string,
  log: RequestLogger | undefined,
): Promise<PrMetadataGeneration> {
  try {
    const result = await generateText({
      model: workersAi(model),
      system,
      temperature: 0.2,
      output: Output.object({
        schema: PR_METADATA_OUTPUT_SCHEMA,
      }),
      prompt,
    });

    return {
      metadata: parsePrMetadata(result.output),
      generationMode: "structured",
    };
  } catch (err) {
    log?.set({
      message: "Structured PR metadata generation failed; retrying with plain JSON fallback",
      model,
      retryReason: toLogError(err).message,
      validationIssues: err instanceof PrMetadataValidationError ? err.issues : null,
      aiCause: AISDKError.isInstance(err) ? (err.cause ?? null) : null,
      aiText:
        NoObjectGeneratedError.isInstance(err) && typeof err.text === "string"
          ? truncateForLog(err.text)
          : null,
      aiResponse: NoObjectGeneratedError.isInstance(err) ? (err.response ?? null) : null,
      aiUsage: NoObjectGeneratedError.isInstance(err) ? (err.usage ?? null) : null,
      aiFinishReason: NoObjectGeneratedError.isInstance(err) ? (err.finishReason ?? null) : null,
    });
  }

  let fallbackText: string;

  try {
    const fallback = await generateText({
      model: workersAi(model),
      system: `${system}\n\n${STRICT_JSON_FALLBACK_INSTRUCTION}`,
      temperature: 0.2,
      prompt: `${prompt}\n\nReturn only a JSON object.`,
    });
    fallbackText = extractJsonObject(fallback.text);
  } catch (err) {
    throw new PrMetadataGenerationError("Plain JSON fallback request failed", { cause: err });
  }

  let fallbackJson: unknown;

  try {
    fallbackJson = JSON.parse(fallbackText);
  } catch (parseError) {
    log?.set({
      message: "Plain JSON fallback returned invalid JSON",
      model,
      fallbackText: truncateForLog(fallbackText),
    });
    throw new PrMetadataGenerationError("Plain JSON fallback returned invalid JSON", {
      cause: parseError,
    });
  }

  try {
    return {
      metadata: parsePrMetadata(fallbackJson),
      generationMode: "plain-json-fallback",
    };
  } catch (err) {
    log?.set({
      message: "Plain JSON fallback returned invalid PR metadata",
      model,
      fallbackText: truncateForLog(fallbackText),
      validationIssues: err instanceof PrMetadataValidationError ? err.issues : null,
    });
    throw new PrMetadataGenerationError("Plain JSON fallback returned invalid PR metadata", {
      cause: err,
    });
  }
}

app.post("/api/pr-metadata", async (c) => {
  const log = getRequestLogger(c.req.raw);

  const timestampHeader = c.req.header("x-timestamp");
  const signatureHeader = c.req.header("x-signature");

  if (!timestampHeader || !signatureHeader) {
    return createError(c, 401, "Missing HMAC headers");
  }

  const timestamp = timestampSchema.safeParse(timestampHeader);
  if (!timestamp.success) {
    return createError(c, 401, "Expired or invalid timestamp");
  }

  const rawBody = await c.req.raw.text();
  const isValidSignature = await verifyHmacSignature({
    secret: c.env.HMAC_SECRET,
    payload: `${timestampHeader}.${rawBody}`,
    signature: signatureHeader,
    format: "hex",
  });

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
    const issue = body.error.issues[0];
    const field = issue?.path.join(".");
    return createError(
      c,
      400,
      issue ? `${field ? `${field}: ` : ""}${issue.message}` : "Invalid request body",
    );
  }

  const { repository, diff, context, model: requestedModel } = body.data;
  const model = requestedModel ?? DEFAULT_PR_METADATA_MODEL;

  const workersAi = createWorkersAI({
    binding: c.env.AI,
  });

  log?.set({
    message: "Generating PR metadata via AI SDK",
    repository,
    model,
    modelSource: requestedModel ? "request" : "default",
    contextLength: context?.length ?? 0,
    diffLength: diff.length,
  });

  const generated = await generatePrMetadata(
    workersAi,
    model,
    buildPrMetadataSystemPrompt(repository, context),
    buildPrMetadataUserPrompt(repository, diff),
    log,
  );

  log?.set({
    message: "Generated PR metadata successfully",
    metadata: generated.metadata,
    generationMode: generated.generationMode,
  });

  return c.json(generated.metadata);
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

  // The model did not produce usable metadata. Callers treat this like a timeout and mark the PR incomplete.
  if (err instanceof PrMetadataGenerationError) {
    return createError(c, 502, "PR metadata generation failed");
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
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
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
