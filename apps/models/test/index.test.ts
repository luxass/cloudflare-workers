import { MockLanguageModelV4 } from "ai/test";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as workersAiProvider from "workers-ai-provider";

import worker from "../src";

const doGenerateMock = vi.fn<MockLanguageModelV4["doGenerate"]>();
const createWorkersAIMock = vi.fn();
const modelMock = vi.fn();

function modelResponse(text: string): Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>> {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}

const METADATA_REQUEST = {
  repository: "luxass/cloudflare-workers",
  context: "Use the Worker name as the commit scope.",
  diff: "diff --git a/apps/image/src/index.ts b/apps/image/src/index.ts\n+const ready = true;",
};
const GENERATED_METADATA = {
  type: "feat",
  scope: "image",
  message: "add readiness flag",
  body: "- Add a readiness flag to the image Worker.",
};

async function requestModels(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://models.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function signedHeaders(
  body: string,
  timestamp = String(Date.now()),
  secret = env.HMAC_SECRET,
): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));

  return {
    "content-type": "application/json",
    "x-timestamp": timestamp,
    "x-signature": [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  };
}

async function postSignedMetadata(body = JSON.stringify(METADATA_REQUEST)): Promise<Response> {
  return requestModels("/api/pr-metadata", {
    method: "POST",
    headers: await signedHeaders(body),
    body,
  });
}

beforeEach(() => {
  doGenerateMock.mockReset();
  createWorkersAIMock.mockReset();
  modelMock.mockReset();
  modelMock.mockReturnValue(new MockLanguageModelV4({ doGenerate: doGenerateMock }));
  createWorkersAIMock.mockReturnValue(modelMock);
  doGenerateMock.mockResolvedValue(modelResponse(JSON.stringify(GENERATED_METADATA)));
  vi.spyOn(workersAiProvider, "createWorkersAI").mockImplementation(createWorkersAIMock);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected outbound request in models unit tests"),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("common routes", () => {
  it("responds to /ping with pong", async () => {
    const response = await requestModels("/ping");

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("pong!");
  });

  it("redirects /view-source to the models source", async () => {
    const response = await requestModels("/view-source");

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://github.com/luxass/cloudflare-workers/tree/main/apps/models",
    );
  });

  it("returns a JSON 404 for an unknown route", async () => {
    const response = await requestModels("/not-found");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Not found",
      status: 404,
      path: "/not-found",
      timestamp: expect.any(String),
    });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });
});

describe("HMAC authentication", () => {
  it("rejects missing HMAC headers without calling AI", async () => {
    const response = await requestModels("/api/pr-metadata", { method: "POST", body: "{}" });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Missing HMAC headers" });
    expect(createWorkersAIMock).not.toHaveBeenCalled();
    expect(doGenerateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["non-numeric", "not-a-timestamp"],
    ["unsafe integer", "9007199254740992"],
    ["expired", String(Date.now() - 6 * 60 * 1000)],
    ["too far in the future", String(Date.now() + 6 * 60 * 1000)],
  ])("rejects a %s timestamp", async (_label, timestamp) => {
    const body = JSON.stringify(METADATA_REQUEST);
    const response = await requestModels("/api/pr-metadata", {
      method: "POST",
      headers: await signedHeaders(body, timestamp),
      body,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Expired or invalid timestamp" });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed signature", async () => {
    const body = JSON.stringify(METADATA_REQUEST);
    const response = await requestModels("/api/pr-metadata", {
      method: "POST",
      headers: { ...(await signedHeaders(body)), "x-signature": "not-hex" },
      body,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Invalid signature" });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects a signature made with a different secret", async () => {
    const body = JSON.stringify(METADATA_REQUEST);
    const response = await requestModels("/api/pr-metadata", {
      method: "POST",
      headers: await signedHeaders(body, String(Date.now()), "wrong-unit-test-secret"),
      body,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Invalid signature" });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const originalBody = JSON.stringify(METADATA_REQUEST);
    const response = await requestModels("/api/pr-metadata", {
      method: "POST",
      headers: await signedHeaders(originalBody),
      body: JSON.stringify({ ...METADATA_REQUEST, diff: "tampered" }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Invalid signature" });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });
});

describe("request validation", () => {
  it("rejects signed invalid JSON before calling AI", async () => {
    const response = await postSignedMetadata("{");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Invalid JSON body" });
    expect(doGenerateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing fields", {}],
    ["wrong repository owner", { ...METADATA_REQUEST, repository: "other/repo" }],
    ["empty diff", { ...METADATA_REQUEST, diff: "" }],
    ["oversized diff", { ...METADATA_REQUEST, diff: "x".repeat(100_001) }],
    ["empty context", { ...METADATA_REQUEST, context: "" }],
    ["oversized system prompt", { ...METADATA_REQUEST, system: "x".repeat(2_001) }],
  ])("rejects %s before calling AI", async (_label, body) => {
    const response = await postSignedMetadata(JSON.stringify(body));

    expect(response.status).toBe(400);
    expect(createWorkersAIMock).not.toHaveBeenCalled();
    expect(doGenerateMock).not.toHaveBeenCalled();
  });
});

describe("metadata generation", () => {
  it("accepts a valid signature and returns structured metadata", async () => {
    const response = await postSignedMetadata();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(GENERATED_METADATA);
    expect(createWorkersAIMock).toHaveBeenCalledWith({ binding: env.AI });
    expect(modelMock).toHaveBeenCalledWith(env.DEFAULT_MODEL);
    expect(doGenerateMock).toHaveBeenCalledOnce();
    expect(doGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "text",
                text: expect.stringContaining(METADATA_REQUEST.diff),
              }),
            ]),
          }),
        ]),
        responseFormat: expect.objectContaining({ type: "json" }),
      }),
    );
  });

  it("validates structured output with the real SDK before using the fallback", async () => {
    doGenerateMock
      .mockResolvedValueOnce(
        modelResponse(JSON.stringify({ ...GENERATED_METADATA, type: "invalid" })),
      )
      .mockResolvedValueOnce(modelResponse(JSON.stringify(GENERATED_METADATA)));

    const response = await postSignedMetadata();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(GENERATED_METADATA);
    expect(doGenerateMock).toHaveBeenCalledTimes(2);
  });

  it("uses the caller's system prompt", async () => {
    const response = await postSignedMetadata(
      JSON.stringify({ ...METADATA_REQUEST, system: "Use concise commit messages." }),
    );

    expect(response.status).toBe(200);
    expect(doGenerateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.arrayContaining([
          { role: "system", content: "Use concise commit messages." },
        ]),
      }),
    );
  });

  it.each([
    [" image ", "image"],
    [" PR ", ""],
    ["pull_request", ""],
    ["github", ""],
    ["automation", ""],
    ["schema", ""],
  ])("normalizes scope %j to %j", async (scope, expectedScope) => {
    doGenerateMock.mockResolvedValueOnce(
      modelResponse(JSON.stringify({ ...GENERATED_METADATA, scope })),
    );

    const response = await postSignedMetadata();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...GENERATED_METADATA, scope: expectedScope });
  });

  it.each([
    ["plain JSON", JSON.stringify(GENERATED_METADATA)],
    ["fenced JSON", `\`\`\`json\n${JSON.stringify(GENERATED_METADATA)}\n\`\`\``],
    ["surrounding prose", `Result:\n${JSON.stringify(GENERATED_METADATA)}\nDone.`],
  ])("retries with %s when structured generation fails", async (_label, text) => {
    doGenerateMock
      .mockRejectedValueOnce(new Error("Structured output is unavailable"))
      .mockResolvedValueOnce(modelResponse(text));

    const response = await postSignedMetadata();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(GENERATED_METADATA);
    expect(doGenerateMock).toHaveBeenCalledTimes(2);
    expect(doGenerateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Return exactly one JSON object"),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({
                type: "text",
                text: expect.stringContaining("Return only a JSON object."),
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it.each([
    ["invalid JSON", "not JSON"],
    ["invalid metadata", JSON.stringify({ type: "invalid" })],
  ])("returns a safe 500 for %s in the fallback", async (_label, text) => {
    doGenerateMock
      .mockRejectedValueOnce(new Error("Structured output is unavailable"))
      .mockResolvedValueOnce(modelResponse(text));

    const response = await postSignedMetadata();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      path: "/api/pr-metadata",
      status: 500,
      message: "Internal server error",
      timestamp: expect.any(String),
    });
    expect(doGenerateMock).toHaveBeenCalledTimes(2);
  });

  it("returns a safe 500 when both generation attempts fail", async () => {
    doGenerateMock.mockRejectedValue(new Error("Private upstream error details"));

    const response = await postSignedMetadata();

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: "Internal server error" });
    expect(doGenerateMock).toHaveBeenCalledTimes(2);
  });
});
