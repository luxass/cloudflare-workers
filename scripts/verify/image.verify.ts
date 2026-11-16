import { beforeAll, describe, expect, it } from "vitest";

import { fetchFromWorker, waitForWorker } from "./shared.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

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
    "https://github.com/luxass/cloudflare-workers/tree/main/apps/image",
  );
});

it("GET unknown route responds with a JSON 404", async () => {
  const response = await fetchFromWorker("/this-route-does-not-exist");

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ status: 404, message: "Not found" });
});

describe("text image", () => {
  it("GET /api/image/text renders a PNG", async () => {
    const response = await fetchFromWorker("/api/image/text?text=verify&width=600&height=315");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual(PNG_SIGNATURE);
  });

  it("GET /api/image/text rejects an invalid width", async () => {
    const response = await fetchFromWorker("/api/image/text?width=99999");

    expect(response.status).toBe(400);
  });
});
