import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../src";

it("respond with a 404", async () => {
  const request = new Request("https://unicode-tools.luxass.dev/not-found");
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
  const request = new Request("https://unicode-tools.luxass.dev/ping");
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(418);
  expect(await response.text()).toBe("pong!");
});
