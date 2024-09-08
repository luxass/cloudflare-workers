import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src";
import type { HonoBindings } from "../src";

declare module "cloudflare:test" {
  // eslint-disable-next-line ts/no-empty-object-type
  interface ProvidedEnv extends HonoBindings { }
}

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
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/mosaic",
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
        url: "https://worker.mosaic.luxass.dev",
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
        url: "https://preview.mosaic-worker.luxass.dev",
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
