import type { ApiError } from "@cf-workers/helpers";
import {
  cache,
  createPingPongRoute,
  createViewSourceRedirect,
  deleteRequestLogger,
  getRequestLogger,
  setRequestLogger,
  toLogError,
} from "@cf-workers/helpers";
import { createWorkersLogger, initWorkersLogger } from "evlog/workers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export interface HonoContext {
  Bindings: CloudflareBindings;
}

initWorkersLogger({
  env: { service: "assets" },
});

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("assets"));
app.get("/ping", createPingPongRoute());
app.get(
  "/api/fonts/*",
  cache({
    cacheName: "fonts",
    cacheControl: "max-age=3600, stale-while-revalidate=3600",
  }),
);

const fontsUserAgent =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

function isFontContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  return (
    contentType.startsWith("font/") ||
    contentType.startsWith("application/font") ||
    contentType.startsWith("application/octet-stream")
  );
}

async function fetchFont(fontsUrl: string): Promise<Response | null> {
  const cssResponse = await fetch(fontsUrl, {
    headers: {
      // Make sure it returns TTF.
      "User-Agent": fontsUserAgent,
    },
  });
  const css = await cssResponse.text();

  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/);

  if (!resource || !resource[1]) {
    return null;
  }

  const response = await fetch(resource[1]);
  if (!response.ok || !isFontContentType(response.headers.get("content-type"))) {
    return null;
  }

  return response;
}

function createFontsCssUrl(family: string, weight: string, text?: string): string {
  let fontsUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`;
  if (text) {
    // allow font optimization if we pass text => only getting the characters we need
    fontsUrl += `&text=${encodeURIComponent(text)}`;
  }

  return fontsUrl;
}

app.get("/api/fonts/:family/:weight/:text?", async (c) => {
  const url = new URL(c.req.url);
  const { family: _family, weight, text } = c.req.param();
  const log = getRequestLogger(c.req.raw);

  const family = _family[0].toUpperCase() + _family.slice(1);
  const fontsUrl = createFontsCssUrl(family, weight, text);
  log?.set({
    message: "Fetching font asset",
    font: { family, weight, text: text ?? null },
    route: url.pathname,
  });

  let res: Response | null = null;
  try {
    res = await fetchFont(fontsUrl);
    if (!res && text) {
      // Retry without text optimization because the upstream API can intermittently return invalid non-font responses.
      res = await fetchFont(createFontsCssUrl(family, weight));
    }
  } catch (error) {
    log?.error(toLogError(error), { font: { family, weight, text: text ?? null } });
    return new Response("Failed to fetch font resource", { status: 502 });
  }

  if (!res) {
    return new Response("No resource found", { status: 404 });
  }

  const arrayBuffer = await res.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  const response = new Response(body, res);

  if (url.hostname === "localhost") {
    response.headers.delete("content-encoding");
    response.headers.delete("content-length");
  }

  return response;
});

app.get("*", async (c) => {
  const url = new URL(c.req.url);

  if (url.pathname === "/") {
    url.pathname = "/README.md";
  }

  const branch = url.searchParams.get("branch") || "main";
  const log = getRequestLogger(c.req.raw);
  log?.set({ message: "Fetching GitHub asset", asset: { branch, path: url.pathname } });
  const res = await fetch(
    `https://raw.githubusercontent.com/luxass/assets/${branch}/${url.pathname}`,
  );

  if (!res.ok) {
    return c.notFound();
  }

  const arrayBuffer = await res.arrayBuffer();
  const body = new Uint8Array(arrayBuffer);

  return new Response(body, res);
});

app.onError(async (err, c) => {
  const log = getRequestLogger(c.req.raw);
  log?.error(toLogError(err), { message: "Assets request failed" });
  const url = new URL(c.req.url);
  if (err instanceof HTTPException) {
    return c.json(
      {
        path: url.pathname,
        status: err.status,
        message: err.message,
        timestamp: new Date().toISOString(),
      } satisfies ApiError,
      err.status,
    );
  }

  return c.json(
    {
      path: url.pathname,
      status: 500,
      message: "Internal server error",
      timestamp: new Date().toISOString(),
    } satisfies ApiError,
    500,
  );
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  const log = getRequestLogger(c.req.raw);
  log?.set({ message: "Assets route not found", response: { status: 404 }, route: url.pathname });
  return c.json(
    {
      path: url.pathname,
      status: 404,
      message: "Not found",
      timestamp: new Date().toISOString(),
    } satisfies ApiError,
    404,
  );
});

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    executionCtx: ExecutionContext,
  ): Promise<Response> {
    const log = setRequestLogger(request, createWorkersLogger(request));
    log.set({ message: "Handling assets request", environment: env.ENVIRONMENT ?? "local" });

    try {
      const response = await app.fetch(request, env, executionCtx);
      log.set({ response: { status: response.status } });
      log.emit();
      return response;
    } catch (error) {
      log.error(toLogError(error));
      log.emit();
      throw error;
    } finally {
      deleteRequestLogger(request);
    }
  },
};
