import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { createMiddleware } from "hono/factory";
import type { HonoContext } from "./types";
import { $Octokit } from "./utils";
import { RELEASES_ROUTER } from "./routes/releases";
import { BUILTIN_EXTENSIONS_ROUTER } from "./routes/builtin-extensions";

const app = new OpenAPIHono<HonoContext>();

app.use("*", logger());

const octokitMiddleware = createMiddleware(async (c, next) => {
  const octokit = new $Octokit({
    auth: c.env.GITHUB_TOKEN,
  });

  c.set("octokit", octokit);

  await next();
});

const cachingMiddleware = createMiddleware(async (c, next) => {
  if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "preview") {
    return await next();
  }
  const key = c.req.url;
  const cache = await caches.open("vscode");

  const response = await cache.match(key);
  if (!response) {
    // eslint-disable-next-line no-console
    console.debug("serving from network");
    await next();
    if (!c.res.ok) {
      console.error("failed to fetch, skipping cache");
      return;
    }

    c.res.headers.set("Cache-Control", "public, max-age=3600");

    const response = c.res.clone();
    c.executionCtx.waitUntil(cache.put(key, response));
  } else {
    // eslint-disable-next-line no-console
    console.debug("serving from cache");
    return new Response(response.body, response);
  }
});

app.use("/releases/*", octokitMiddleware);
app.use("/builtin-extensions/*", octokitMiddleware);

app.use("/releases/*", cachingMiddleware);
app.use("/builtin-extensions/*", cachingMiddleware);

app.route("/releases", RELEASES_ROUTER);
app.route("/builtin-extensions", BUILTIN_EXTENSIONS_ROUTER);

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

app.doc("/openapi.json", (c) => {
  const server = {
    url: "http://localhost:8787",
    description: "Local Environment",
  };

  if (c.env.ENVIRONMENT === "production") {
    server.url = "https://vscode.luxass.dev";
    server.description = "Production Environment";
  }

  if (c.env.ENVIRONMENT === "preview") {
    server.url = "https://preview.vscode.luxass.dev";
    server.description = "Preview Environment";
  }

  return {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "A Cloudflare worker that offers a JSON API to retrieve information about built-in Visual Studio Code extensions.",
    },
    tags: [
      {
        name: "Releases",
        description: "Endpoints to retrieve information about Visual Studio Code releases.",
      },
      {
        name: "Builtin Extensions",
        description: "Endpoints to retrieve information about built-in Visual Studio Code extensions.",
      },
    ],
    servers: [
      server,
    ],
  };
});

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/cloudflare-workers/tree/main/apps/vscode", 301);
});

app.get("/ping", (c) => {
  return c.text("pong!", 418);
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
    }, err.status);
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  }, 500);
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  }, 404);
});

export default app;
