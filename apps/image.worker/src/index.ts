import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export interface HonoContext {
  Bindings: {
    ENVIRONMENT: string;
  };
}

const app = new Hono<HonoContext>();

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/cloudflare-workers/tree/main/apps/image.worker", 301);
});

app.get("/ping", (c) => {
  c.status(418);
  return c.text("pong!");
});

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
