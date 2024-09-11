import type { Context, Env } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { createMiddleware } from "hono/factory";
import type { ApiError } from "./schemas";

export type { ApiError };
export { ApiErrorSchema } from "./schemas";

export function createError<TCtx extends Context, TStatus extends StatusCode>(ctx: TCtx, status: TStatus, message: string) {
  const url = new URL(ctx.req.url);
  return ctx.json({
    path: url.pathname,
    message,
    status,
    timestamp: new Date().toISOString(),
  } satisfies ApiError, status, {
    "Content-Type": "application/json",
  });
}

export function createCacheMiddleware<TEnv extends Env>(cacheName: string) {
  return createMiddleware<TEnv>(async (c, next) => {
    const key = c.req.url;
    const cache = await caches.open(cacheName);

    const response = await cache.match(key);
    if (!response) {
      await next();
      if (!c.res.ok) {
        return;
      }

      c.res.headers.set("Cache-Control", "public, max-age=3600");

      const response = c.res.clone();
      c.executionCtx.waitUntil(cache.put(key, response));
    } else {
      return new Response(response.body, response);
    }
  });
}

export function createViewSourceRedirect(workerName: string) {
  return (c: Context) => {
    return c.redirect(`https://github.com/luxass/cloudflare-workers/tree/main/apps/${workerName}`, 301);
  };
}

export function createPingPongRoute() {
  return (c: Context) => {
    return c.text("pong!", 418);
  };
}
