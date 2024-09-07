import {
  createExecutionContext,
  env,
  fetchMock,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src";
import type { HonoBindings } from "../src/types";

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
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/image",
  );
});
