import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HonoContext } from "./types";
import { textImageRouter } from "./routes/text";
import { emojiRouter } from "./routes/emoji";
import { postImageRouter } from "./routes/post";
import { projectImageRouter } from "./routes/project";

const app = new Hono<HonoContext>();

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/cloudflare-workers/tree/main/apps/image.worker", 301);
});

app.get("/ping", (c) => {
  c.status(418);
  return c.text("pong!");
});

app.get(
  "/api/image/*",
  async (c, next) => {
    if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "preview") {
      return await next();
    }
    const key = c.req.url;
    const cache = await caches.open("og-images");

    const response = await cache.match(key);
    if (!response) {
      // eslint-disable-next-line no-console
      console.info("serving image from network");
      await next();
      if (!c.res.ok) {
        console.error("failed to fetch image, skipping caching");
        return;
      }

      c.res.headers.set("Cache-Control", "public, max-age=3600");

      const response = c.res.clone();
      c.executionCtx.waitUntil(cache.put(key, response));
    } else {
      // eslint-disable-next-line no-console
      console.info("serving image from cache");
      return new Response(response.body, response);
    }
  },
);

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
    });
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  });
});

export default app;
