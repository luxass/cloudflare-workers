import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { TestContext } from "vitest";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

import worker from "../src";
import { FONT_PARAMS } from "../src/utils";

const fetchMock = vi.fn<typeof fetch>();
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function requestImage(path: string): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://image.test${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function expectRenderedImage(
  response: Response,
  width: number,
  height: number,
  context: TestContext,
): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  expect(bytes.byteLength).toBeGreaterThan(1_000);

  const header = new DataView(buffer);
  expect(header.getUint32(16)).toBe(width);
  expect(header.getUint32(20)).toBe(height);

  // Keep the actual PNG as a Vitest attachment, not a mocked rendering result.
  await context.annotate("Rendered image", { body: bytes, contentType: "image/png" });

  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  const sha256 = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  expect({ width, height, sha256 }).toMatchSnapshot();
}

beforeEach(() => {
  const fixtures = inject("imageFixtures");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const weight = url.pathname.split("/").at(-1);

    if (
      url.origin === "https://assets.luxass.dev" &&
      url.pathname.startsWith("/api/fonts/Inter/") &&
      (weight === "400" || weight === "700" || weight === "900")
    ) {
      return new Response(decodeBase64(fixtures.fonts[weight]), {
        headers: { "content-type": "font/ttf" },
      });
    }

    if (url.origin === "https://cloudflare-dns.com" && url.pathname === "/dns-query") {
      const ipv4 = url.searchParams.get("type") === "A";
      const type = ipv4 ? 1 : 28;
      return Response.json({
        Status: 0,
        Question: [{ name: "assets.luxass.dev", type }],
        Answer: [
          {
            name: "assets.luxass.dev",
            type,
            TTL: 60,
            data: ipv4 ? "93.184.216.34" : "2606:4700::1111",
          },
        ],
      });
    }

    if (url.href === "https://assets.luxass.dev/logos/dino.png") {
      return new Response(decodeBase64(fixtures.logoPng), {
        headers: { "content-type": "image/png" },
      });
    }

    if (url.href === "https://assets.luxass.dev/logos/dino.svg") {
      return new Response(fixtures.logoSvg, { headers: { "content-type": "image/svg+xml" } });
    }

    if (url.href === "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60a.svg") {
      return new Response(fixtures.emojiSvg, { headers: { "content-type": "image/svg+xml" } });
    }

    if (url.href === "https://api.github.com/repos/luxass/cloudflare-workers") {
      return Response.json({ stargazers_count: 42 });
    }

    throw new Error(`Unexpected outbound request in image unit tests: ${url.href}`);
  });

  vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  // Make the emoji selection deterministic; all image rendering remains real.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("common routes", () => {
  it("responds to /ping with pong", async () => {
    const response = await requestImage("/ping");

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("pong!");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects /view-source to the image source", async () => {
    const response = await requestImage("/view-source");

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(
      "https://github.com/luxass/cloudflare-workers/tree/main/apps/image",
    );
  });

  it("returns a JSON 404 for an unknown route", async () => {
    const response = await requestImage("/not-found");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Not found",
      status: 404,
      path: "/not-found",
      timestamp: expect.any(String),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("text images", () => {
  it("renders a PNG with the default dimensions", async (context) => {
    await expectRenderedImage(await requestImage("/api/image/text"), 1200, 630, context);
  });

  it("renders text at the requested dimensions", async (context) => {
    const response = await requestImage("/api/image/text?text=Test&width=600&height=315");

    await expectRenderedImage(response, 600, 315, context);
  });

  it.each(["width=1501", "height=-1", "width=not-a-number"])(
    "rejects invalid dimensions: %s",
    async (query) => {
      const response = await requestImage(`/api/image/text?${query}`);

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("emoji images", () => {
  it("renders an emoji PNG using the local SVG fixture", async (context) => {
    await expectRenderedImage(
      await requestImage("/api/image/emoji?width=600&height=315"),
      600,
      315,
      context,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f60a.svg",
    );
  });

  it("rejects invalid dimensions before loading assets", async () => {
    const response = await requestImage("/api/image/emoji?height=1501");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("post images", () => {
  it("renders a post PNG with local fonts and logo", async (context) => {
    const query = new URLSearchParams({
      title: "Unit test",
      description: "A test post",
      date: "2026-11-16",
    });

    await expectRenderedImage(await requestImage(`/api/image/post?${query}`), 1200, 600, context);

    for (const weight of [400, 700, 900]) {
      expect(fetchMock).toHaveBeenCalledWith(`https://assets.luxass.dev/api/fonts/Inter/${weight}`);
    }
    expect(fetchMock).toHaveBeenCalledWith("https://assets.luxass.dev/logos/dino.png", {
      redirect: "manual",
    });
  });
});

describe("project images", () => {
  it("renders a project PNG with authenticated repository metadata", async (context) => {
    const response = await requestImage("/api/image/project?repo=luxass/cloudflare-workers");

    await expectRenderedImage(response, 1200, 600, context);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/luxass/cloudflare-workers",
      {
        headers: {
          authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "image.luxass.dev",
        },
      },
    );
    expect(fetchMock).toHaveBeenCalledWith("https://assets.luxass.dev/logos/dino.svg", {
      redirect: "manual",
    });
  });

  it.each(["", "?repo=invalid"])("rejects a missing or malformed repository: %s", async (query) => {
    const response = await requestImage(`/api/image/project${query}`);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an upstream response without repository metadata", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: "Not Found" }, { status: 404 }));

    const response = await requestImage("/api/image/project?repo=luxass/missing");

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid repo");
  });
});

describe("JSON query parameters", () => {
  it("parses valid JSON and applies schema defaults", () => {
    const input = encodeURIComponent(JSON.stringify({ family: "Inter" }));
    const result = FONT_PARAMS.decodeRequest(new Request(`https://image.test/?input=${input}`));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ input: { family: "Inter", weight: 400 } });
    }
  });

  it("rejects invalid JSON with the expected validation message", () => {
    const result = FONT_PARAMS.decodeRequest(new Request("https://image.test/?input=%7B"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({ code: "custom", message: "Needs to be JSON" }),
      ]);
    }
  });

  it("rejects valid JSON that does not match the schema", () => {
    const input = encodeURIComponent(JSON.stringify({ family: 123 }));
    const result = FONT_PARAMS.decodeRequest(new Request(`https://image.test/?input=${input}`));

    expect(result.success).toBe(false);
  });
});
