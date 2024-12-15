import type { HonoContext } from "./types";
import { type ApiError, createCacheMiddleware, createPingPongRoute, createViewSourceRedirect } from "@cf-workers/helpers";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { BUILTIN_EXTENSIONS_ROUTER } from "./routes/builtin-extensions";
import { MISC_ROUTER } from "./routes/misc";
import { RELEASES_ROUTER } from "./routes/releases";
import { $Octokit } from "./utils";

const app = new OpenAPIHono<HonoContext>();

const octokitMiddleware = createMiddleware<HonoContext>(async (c, next) => {
  const octokit = new $Octokit({
    auth: c.env.GITHUB_TOKEN,
  });

  c.set("octokit", octokit);

  await next();
});

const cacheMiddleware = createCacheMiddleware("vscode");

app.get("/view-source", createViewSourceRedirect("vscode"));
app.get("/ping", createPingPongRoute());

app.use("/releases/*", octokitMiddleware);
app.use("/builtin-extensions/*", octokitMiddleware);

app.use("/releases/*", cacheMiddleware);
app.use("/builtin-extensions/*", cacheMiddleware);

app.route("/releases", RELEASES_ROUTER);
app.route("/builtin-extensions", BUILTIN_EXTENSIONS_ROUTER);
app.route("/", MISC_ROUTER);

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
