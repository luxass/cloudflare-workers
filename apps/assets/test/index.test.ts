import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src";

const fetchMock = vi.fn<typeof fetch>();
const cacheKeys = new Set<string>();
const FONT_BYTES = new Uint8Array([0, 1, 0, 0, 10, 20, 30, 40]);
const FONT_URL = "https://fonts.gstatic.com/unit-test.ttf";
const FONT_CSS = `@font-face { src: url(${FONT_URL}) format('truetype'); }`;

async function requestAssets(path: string): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request(`https://assets.test${path}`);
  cacheKeys.add(request.url);
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function mockFontResponse(): void {
  fetchMock
    .mockResolvedValueOnce(new Response(FONT_CSS))
    .mockResolvedValueOnce(
      new Response(FONT_BYTES.slice(), { headers: { "content-type": "font/ttf" } }),
    );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("Unexpected outbound request in assets unit tests"));
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
});

afterEach(async () => {
  const cache = await caches.open("fonts");
  await Promise.all([...cacheKeys].map((key) => cache.delete(key)));
  cacheKeys.clear();
  vi.restoreAllMocks();
});

describe("common routes", () => {
  it("responds to /ping with pong", async () => {
    const response = await requestAssets("/ping");

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("pong!");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects /view-source to the assets source", async () => {
    const response = await requestAssets("/view-source");

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://github.com/luxass/cloudflare-workers/tree/main/apps/assets",
    );
  });

  it("returns a JSON 404 for an unknown asset", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const response = await requestAssets("/not-found");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Not found",
      status: 404,
      path: "/not-found",
      timestamp: expect.any(String),
    });
  });
});

describe("fonts", () => {
  it("fetches a font and caches its bytes", async () => {
    mockFontResponse();
    const path = "/api/fonts/inter/400";
    const cache = await caches.open("fonts");
    expect(await cache.match(`https://assets.test${path}`)).toBeUndefined();

    const response = await requestAssets(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/ttf");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FONT_BYTES);
    expect(await cache.match(`https://assets.test${path}`)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(FONT_URL);
  });

  it("requests an optimized font when text is provided", async () => {
    mockFontResponse();

    const response = await requestAssets("/api/fonts/inter/400/Hello%20World");

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FONT_BYTES);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400&text=Hello%20World",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("retries without text optimization when the stylesheet contains no font", async () => {
    fetchMock.mockResolvedValueOnce(new Response("No optimized font"));
    mockFontResponse();

    const response = await requestAssets("/api/fonts/inter/400/Hello%20World");

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FONT_BYTES);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://fonts.googleapis.com/css2?family=Inter:wght@400",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it.each(["", "/Hello%20World"])("does not cache a missing font: %s", async (text) => {
    fetchMock.mockImplementation(async () => new Response("No font found", { status: 404 }));
    const path = `/api/fonts/thisdoesnotexist/900${text}`;

    const response = await requestAssets(path);

    expect(response.status).toBe(404);
    const cache = await caches.open("fonts");
    expect(await cache.match(`https://assets.test${path}`)).toBeUndefined();
  });

  it("rejects an upstream response that is not a font", async () => {
    fetchMock.mockResolvedValueOnce(new Response(FONT_CSS)).mockResolvedValueOnce(
      new Response("<html>not a font</html>", {
        headers: { "content-type": "text/html" },
      }),
    );

    const response = await requestAssets("/api/fonts/inter/400");

    expect(response.status).toBe(404);
  });

  it("returns 502 and does not cache an upstream failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Font upstream is unavailable"));

    const response = await requestAssets("/api/fonts/inter/400");

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Failed to fetch font resource");
    const cache = await caches.open("fonts");
    expect(await cache.match("https://assets.test/api/fonts/inter/400")).toBeUndefined();
  });

  it("serves a cached font without another upstream request", async () => {
    mockFontResponse();

    const firstResponse = await requestAssets("/api/fonts/inter/400");
    const cachedResponse = await requestAssets("/api/fonts/inter/400");

    expect(firstResponse.status).toBe(200);
    expect(cachedResponse.status).toBe(200);
    expect(new Uint8Array(await cachedResponse.arrayBuffer())).toEqual(FONT_BYTES);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("assets", () => {
  it("serves the README at the root", async () => {
    fetchMock.mockResolvedValueOnce(new Response("# Test assets\n"));

    const response = await requestAssets("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("# Test assets\n");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/main\/+README\.md$/));
  });

  it("serves an asset with its upstream content type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("GIF89a", {
        headers: { "content-type": "image/gif" },
      }),
    );

    const response = await requestAssets("/wave.gif");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new TextEncoder().encode("GIF89a"),
    );
  });

  it("fetches an asset from the requested branch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("# Hello, World!\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );

    const response = await requestAssets("/hello.md?branch=test-branch");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("# Hello, World!\n");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/test-branch\/+hello\.md$/));
  });

  it("returns a JSON 404 for a missing asset on another branch", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const response = await requestAssets("/missing?branch=test-branch");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ path: "/missing", status: 404 });
  });
});
