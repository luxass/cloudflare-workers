import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import {
  router,
} from "./routes";
import type { HonoContext } from "./types";

const app = new OpenAPIHono<HonoContext>();

app.use("*", logger());
app.use(prettyJSON());

app.get(
  "*",
  async (ctx, next) => {
    if (ctx.env.ENVIRONMENT !== "production" && ctx.env.ENVIRONMENT !== "staging") {
      return await next();
    }
    const key = ctx.req.url;
    const cache = await caches.open("vscode");

    const response = await cache.match(key);
    if (!response) {
      await next();
      if (!ctx.res.ok) {
        return;
      }

      ctx.res.headers.set("Cache-Control", "public, max-age=3600");

      const response = ctx.res.clone();
      ctx.executionCtx.waitUntil(cache.put(key, response));
    } else {
      return new Response(response.body, response);
    }
  },
);

app.route("/", router);

app.get(
  "/",
  apiReference({
    spec: {
      url: "/openapi.json",
    },
    layout: "modern",
    theme: "bluePlanet",
  }),
);

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "A Cloudflare worker that offers a JSON API to retrieve information about built-in Visual Studio Code extensions.",
  },
});

app.get("/view-source", (ctx) => {
  return ctx.redirect("https://github.com/luxass/vscode.worker");
});

app.onError(async (err, ctx) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const message = ctx.env.ENVIRONMENT === "production" ? "Internal server error" : err.stack;
  console.error(err);
  return new Response(message, {
    status: 500,
  });
});

app.notFound(async () => {
  return new Response("Not found", {
    status: 404,
  });
});

export default app;
