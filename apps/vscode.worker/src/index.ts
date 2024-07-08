import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { HonoContext } from "./types";
import { $Octokit } from "./utils";
import { RELEASES_ROUTER } from "./routes/releases";
import { BUILTIN_EXTENSIONS_ROUTER } from "./routes/builtin-extensions";

const app = new OpenAPIHono<HonoContext>();

app.use("*", logger());

app.get(
  "*",
  async (c, next) => {
    if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "staging") {
      return await next();
    }
    const key = c.req.url;
    const cache = await caches.open("vscode");

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
  },
);

app.use("*", async (c, next) => {
  const octokit = new $Octokit({
    auth: c.env.GITHUB_TOKEN,
  });

  c.set("octokit", octokit);

  await next();
});

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

app.doc("/openapi.json", {
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
    {
      url: "http://localhost:8787",
      description: "Local Environment",
    },
    {
      url: "https://vscode.luxass.dev",
      description: "Production Environment",
    },
    {
      url: "https://staging.vscode.luxass.dev",
      description: "Staging Environment",
    },
  ],
});

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/vscode.worker");
});

app.onError(async (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({
      error: err.message,
      status: err.status,
      timestamp: new Date().toISOString(),
    }, err.status);
  }

  const message = c.env.ENVIRONMENT === "production" ? "Internal server error" : err.stack;
  console.error(err);

  return c.json({
    error: message,
    status: 500,
    timestamp: new Date().toISOString(),
  }, 500);
});

app.notFound(async (c) => {
  return c.json({
    message: "Not found",
    status: 404,
    timestamp: new Date().toISOString(),
  }, 404);
});

export default app;
