import { beforeAll, describe, expect, it } from "vitest";

import { fetchFromWorker, waitForWorker } from "./shared.ts";

const PR_METADATA_BODY = JSON.stringify({
  repository: "luxass/verify",
  context: "verify",
  diff: "verify",
});

beforeAll(waitForWorker);

it("GET /ping responds with pong", async () => {
  const response = await fetchFromWorker("/ping");

  expect(response.status).toBe(418);
  expect(await response.text()).toBe("pong!");
});

it("GET /view-source redirects to the source code", async () => {
  const response = await fetchFromWorker("/view-source");

  expect(response.status).toBe(301);
  expect(response.headers.get("location")).toBe(
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/models",
  );
});

describe("POST /api/pr-metadata auth", () => {
  it("rejects a request without HMAC headers", async () => {
    const response = await fetchFromWorker("/api/pr-metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: PR_METADATA_BODY,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Missing HMAC headers" });
  });

  it("rejects a request with a bad signature", async () => {
    const response = await fetchFromWorker("/api/pr-metadata", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": String(Date.now()),
        "x-signature": "0".repeat(64),
      },
      body: PR_METADATA_BODY,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "Invalid signature" });
  });
});
