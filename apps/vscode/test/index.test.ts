import type { HonoBindings } from "../src/types";
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";

declare module "cloudflare:test" {
  // eslint-disable-next-line ts/no-empty-object-type
  interface ProvidedEnv extends HonoBindings { }
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...env };
beforeEach(() => {
  Object.assign(env, originalEnv);
});

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
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/vscode",
  );
});

describe("openapi spec", () => {
  it("serve openapi spec", async () => {
    const request = new Request("https://luxass.dev/openapi.json");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.openapi).toBe("3.0.0");
    expect(body.servers).toEqual([
      {
        description: "Production Environment",
        url: "https://vscode.luxass.dev",
      },
    ]);
  });

  it("serve openapi spec in preview environment", async () => {
    const request = new Request("https://luxass.dev/openapi.json");

    // set environment to preview
    env.ENVIRONMENT = "preview";

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.openapi).toBe("3.0.0");
    expect(body.servers).toEqual([
      {
        description: "Preview Environment",
        url: "https://preview.vscode.luxass.dev",
      },
    ]);
  });

  it("serve openapi spec in local environment", async () => {
    const request = new Request("https://luxass.dev/openapi.json");

    // set environment to local
    env.ENVIRONMENT = "local";

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.openapi).toBe("3.0.0");
    expect(body.servers).toEqual([
      {
        description: "Local Environment",
        url: "http://localhost:8787",
      },
    ]);
  });
});

describe("releases", () => {
  it("respond with all releases", async () => {
    const request = new Request("https://luxass.dev/releases");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);
    const body = await response.json() as Record<string, unknown>;

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toEqual({
      tag: expect.any(String),
      url: expect.any(String),
    });
  });

  it("respond with the latest release", async () => {
    const request = new Request("https://luxass.dev/releases/latest");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.tag).toBeDefined();
    expect(body.tag).toBeTypeOf("string");
    expect(body.url).toBeDefined();
    expect(body.url).toBeTypeOf("string");
  });

  it("respond with a specific release", async () => {
    const request = new Request("https://luxass.dev/releases/1.60.0");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.tag).toBe("1.60.0");
    expect(body.url).toBe("https://api.github.com/repos/microsoft/vscode/releases/48909216");
    expect(body.commit).toBe("e7d7e9a9348e6a8cc8c03f877d39cb72e5dfb1ff");
  });

  it("respond with a 404 for a non-existing release", async () => {
    const request = new Request("https://luxass.dev/releases/1.0.0");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
    expect(await response.json()).toEqual({
      message: "No release found",
      status: 404,
      path: "/releases/1.0.0",
      timestamp: expect.any(String),
    });
  });
});

describe("caching", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serve response from cache", async () => {
    let idx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);

        if (
          (request.method === "GET"
            && url.origin === "https://api.github.com"
            && url.pathname === "/repos/microsoft/vscode/releases") && idx === 0
        ) {
          idx++;
          // fetch the actual request
          return originalFetch(input, init);
        }

        return new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    );

    const request = new Request("https://luxass.dev/releases");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);
    const body = await response.json() as unknown[];

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toEqual({
      tag: expect.any(String),
      url: expect.any(String),
    });

    const cachedResponse = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const cachedBody = await cachedResponse.json();

    expect(cachedResponse.status).toBe(200);
    expect(cachedBody).not.toEqual([]);
    expect(await cache.match(request.url)).not.toBe(undefined);
  });

  it("skip caching for failed requests", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);

        if (
          (request.method === "GET"
            && url.origin === "https://api.github.com"
            && url.pathname === "/repos/microsoft/vscode/releases")
        ) {
          return new Response("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          });
        }

        return new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json",
          },
        });
      },
    );

    const request = new Request("https://luxass.dev/releases");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(500);
    expect(await cache.match(request.url)).toBe(undefined);
  });
});

describe("builtin extensions", () => {
  it("respond with all builtin extensions", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);
    const body = await response.json() as {
      extensions: string[];
    };

    expect(Array.isArray(body)).toBe(false);
    expect(Array.isArray(body.extensions)).toBe(true);
    expect(body.extensions.length).toBeGreaterThan(0);
    expect(body.extensions.every((ext) => typeof ext === "string")).toBe(true);
  });

  it("respond with a specific builtin extension", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/yaml");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);

    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.name).toBe("yaml");
    expect(body.version).toBeTypeOf("string");
    expect(body.publisher).toBe("vscode");
    expect(body.description).toBeDefined();
    expect(Array.isArray(body.categories)).toBe(true);
  });

  it("respond with a 404 for a non-existing builtin extension", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/thisdoesnotexist");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
    expect(await response.json()).toEqual({
      message: "No builtin extensions found for thisdoesnotexist",
      status: 404,
      timestamp: expect.any(String),
      path: "/builtin-extensions/thisdoesnotexist",
    });
  });

  it("respond with a specific builtin extension (translated)", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/yaml?translate");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);

    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.name).toBe("yaml");
    expect(body.version).toBeTypeOf("string");
    expect(body.publisher).toBe("vscode");
    expect(body.description).not.toBe("%description%");
    expect(Array.isArray(body.categories)).toBe(true);
  });

  it("respond with a 404 for a non-existing builtin extension (translated)", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/thisdoesnotexist?translate");
    const cache = await caches.open("vscode");

    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
    expect(await response.json()).toEqual({
      message: "No builtin extensions found for thisdoesnotexist",
      status: 404,
      timestamp: expect.any(String),
      path: "/builtin-extensions/thisdoesnotexist",
    });
  });

  it("respond with a specific builtin extension's contributes", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/yaml/contributes");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await cache.match(request.url)).not.toBe(undefined);

    const body = await response.json() as Record<string, unknown>;

    expect(body).toBeTypeOf("object");
    expect(body.languages).toBeDefined();
    expect(Array.isArray(body.languages)).toBe(true);

    expect(body.grammars).toBeDefined();
    expect(Array.isArray(body.grammars)).toBe(true);
  });

  it("respond with a specific builtin extension's configuration", async () => {
    const request = new Request("https://luxass.dev/builtin-extensions/yaml/configuration");
    const cache = await caches.open("vscode");
    expect(await cache.match(request.url)).toBe(undefined);

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(await cache.match(request.url)).toBe(undefined);
    expect(await response.json()).toEqual({
      message: "No configuration found for builtin extension",
      path: "/builtin-extensions/yaml/configuration",
      status: 404,
      timestamp: expect.any(String),
    });
  });
});
