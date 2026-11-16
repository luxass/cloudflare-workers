import { beforeAll, describe, expect, it } from "vitest";

import { fetchFromWorker, waitForWorker } from "./shared.ts";

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
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/assets",
  );
});

it("GET / serves the assets README", async () => {
  const response = await fetchFromWorker("/");

  expect(response.status).toBe(200);
  expect(await response.text()).not.toBe("");
});

it("GET unknown asset responds with a JSON 404", async () => {
  const response = await fetchFromWorker("/this-asset-does-not-exist");

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    message: "Not found",
    status: 404,
    path: "/this-asset-does-not-exist",
    timestamp: expect.any(String),
  });
});

describe("fonts", () => {
  it("GET /api/fonts/inter/400 serves a font", async () => {
    const response = await fetchFromWorker("/api/fonts/inter/400");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^(font\/|application\/)/);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
