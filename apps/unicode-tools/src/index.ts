import type { ApiError } from "@cf-workers/helpers";
import type { HonoContext } from "./types";
import { cache, createPingPongRoute, createViewSourceRedirect } from "@cf-workers/helpers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { V1_UNICODE_FILES_ROUTER } from "./routes/v1_unicode-files";
import { V1_UNICODE_VERSION_ROUTER } from "./routes/v1_unicode-versions";

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("unicode-tools"));
app.get("/ping", createPingPongRoute());

app.route("/api/v1/unicode-versions", V1_UNICODE_VERSION_ROUTER);
app.route("/api/v1/unicode-files", V1_UNICODE_FILES_ROUTER);

app.onError(async (err, c) => {
  console.error(err);
  const url = new URL(c.req.url);
  if (err instanceof HTTPException) {
    return c.json({
      path: url.pathname,
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    } satisfies ApiError, err.status);
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  } satisfies ApiError, 500);
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  } satisfies ApiError, 404);
});

export default app;
