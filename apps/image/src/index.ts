import type { ApiError } from "@cf-workers/helpers";
import type { HonoContext } from "./types";
import { createCacheMiddleware, createPingPongRoute, createViewSourceRedirect } from "@cf-workers/helpers";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { emojiRouter } from "./routes/emoji";
import { postImageRouter } from "./routes/post";
import { projectImageRouter } from "./routes/project";
import { textImageRouter } from "./routes/text";

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("image"));
app.get("/ping", createPingPongRoute());
app.get("/api/image/*", createCacheMiddleware("og-images"));

app.route("/api/image/text", textImageRouter);
app.route("/api/image/emoji", emojiRouter);
app.route("/api/image/post", postImageRouter);
app.route("/api/image/project", projectImageRouter);

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
