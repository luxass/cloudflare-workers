import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import type { ApiError } from "./schemas";

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
