import {
  createExecutionContext,
  env,
  fetchMock,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import worker from "../src";

describe("/api/unicode-versions", () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(() => fetchMock.assertNoPendingInterceptors());

  it("should return unicode versions", async () => {
    fetchMock.enableNetConnect();
    const request = new Request("https://unicode-tools.luxass.dev/api/unicode-versions");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.arrayContaining([
      expect.objectContaining({
        version: expect.any(String),
        documentationUrl: expect.stringMatching(/https:\/\/www\.unicode\.org\/versions\/Unicode\d+\.\d+\.\d+/),
        date: expect.stringMatching(/^\d{4}$/),
        ucdUrl: expect.stringMatching(/https:\/\/www\.unicode\.org\/Public\/\d+\.\d+\.\d+/),
      }),
    ]));
  });

  it("should handle unicode.org being down", async () => {
    fetchMock
      .get("https://www.unicode.org")
      .intercept({ path: "/versions/enumeratedversions.html" })
      .reply(500, "Internal Server Error");

    const request = new Request("https://unicode-tools.luxass.dev/api/unicode-versions");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: "failed to fetch unicode data",
      status: 502,
      path: "/api/unicode-versions",
      timestamp: expect.any(String),
    });
  });
});
