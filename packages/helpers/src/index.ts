import type { Context, Env } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "./schemas";

export { cache } from "./cache";

export type { ApiError };
export { ApiErrorSchema } from "./schemas";

export function createError<TCtx extends Context, TStatus extends ContentfulStatusCode>(ctx: TCtx, status: TStatus, message: string) {
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
