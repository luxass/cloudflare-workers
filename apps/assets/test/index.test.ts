import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../src";

it("respond with a 404", async () => {
  const request = new Request("https://luxass.dev/not-found");
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    message: "Not found",
    status: 404,
    path: "/not-found",
    timestamp: expect.any(String),
  });
});

it("respond with a \"pong!\"", async () => {
  const request = new Request("https://luxass.dev/ping");
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(418);
  expect(await response.text()).toBe("pong!");
});

it("redirect to source code", async () => {
  const request = new Request("https://luxass.dev/view-source");
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(301);
  expect(response.headers.get("Location")).toBe(
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/assets",
  );
});

describe("fonts", () => {
  it("fetch a font", async () => {
    const request = new Request("https://luxass.dev/api/fonts/inter/400");
    const cache = await caches.open("fonts");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("font/ttf");
    // expect(await cache.match(request.url)).not.toBe(undefined);
  });

  it("fetch a font with text", async () => {
    const request = new Request("https://luxass.dev/api/fonts/inter/400/Hello%20World");
    const cache = await caches.open("fonts");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("font/ttf");
    expect(await cache.match(request.url)).not.toBe(undefined);
  });

  it("fetch a non-existent font", async () => {
    const request = new Request("https://luxass.dev/api/fonts/thisdoesnotexist/900");
    const cache = await caches.open("fonts");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
  });

  it("fetch a non-existent font with text", async () => {
    const request = new Request("https://luxass.dev/api/fonts/thisdoesnotexist/900/Hello%20World");
    const cache = await caches.open("fonts");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
  });

  it.todo("serve a font from cache", async () => {
    const request = new Request("https://luxass.dev/api/fonts/inter/400");
    const cache = await caches.open("fonts");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("font/ttf");
    expect(await cache.match(request.url)).not.toBe(undefined);

    const cachedResponse = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(cachedResponse.status).toBe(200);
    expect(cachedResponse.headers.get("Content-Type")).toBe("font/ttf");
    expect(await cache.match(request.url)).not.toBe(undefined);
  });
});

describe("assets", () => {
  it("fetch a non-existent asset", async () => {
    const request = new Request("https://luxass.dev/thisdoesnotexist");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Not found",
      status: 404,
      path: "/thisdoesnotexist",
      timestamp: expect.any(String),
    });
  });

  it("fetch an asset", async () => {
    const request = new Request("https://luxass.dev/wave.gif");

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/gif");
  });

  it("fetch a non-existent asset on a different branch", async () => {
    const request = new Request("https://luxass.dev/thisdoesnotexist?branch=do-not-delete-you-will-be-fired");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Not found",
      status: 404,
      path: "/thisdoesnotexist",
      timestamp: expect.any(String),
    });
  });

  it("fetch a existing asset on a different branch", async () => {
    const request = new Request("https://luxass.dev/hello.md?branch=do-not-delete-you-will-be-fired");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("# Hello, World!\n");
  });
});
