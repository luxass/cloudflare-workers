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

import { emojiRouter } from "./routes/emoji";
import { postImageRouter } from "./routes/post";
import { projectImageRouter } from "./routes/project";
import { textImageRouter } from "./routes/text";
import type { HonoContext } from "./types";

initWorkersLogger({
  env: { service: "image" },
});

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("image"));
app.get("/ping", createPingPongRoute());
app.get(
  "/api/image/*",
  cache({
    cacheName: "image",
    cacheControl: "max-age=3600, stale-while-revalidate=3600",
  }),
);

app.route("/api/image/text", textImageRouter);
app.route("/api/image/emoji", emojiRouter);
app.route("/api/image/post", postImageRouter);
app.route("/api/image/project", projectImageRouter);

app.onError(async (err, c) => {
  const log = getRequestLogger(c.req.raw);
  log?.error(toLogError(err), { message: "Image request failed" });
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
  log?.set({ message: "Image route not found", response: { status: 404 }, route: url.pathname });
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
    log.set({ message: "Handling image request", environment: env.ENVIRONMENT ?? "local" });

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
