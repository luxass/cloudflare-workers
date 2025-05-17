import type { ApiError } from "@cf-workers/helpers";
import type { HonoContext } from "./types";
import { cache, createPingPongRoute, createViewSourceRedirect } from "@cf-workers/helpers";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { BUILTIN_EXTENSIONS_ROUTER } from "./routes/builtin-extensions";
import { RELEASES_ROUTER } from "./routes/releases";
import { VSCE_ROUTER } from "./routes/vsce";
import { $Octokit } from "./utils";

const app = new OpenAPIHono<HonoContext>();

const octokitMiddleware = createMiddleware<HonoContext>(async (c, next) => {
  const octokit = new $Octokit({
    auth: c.env.GITHUB_TOKEN,
  });

  c.set("octokit", octokit);

  await next();
});

const cacheMiddleware = cache({
  cacheName: "vscode",
  cacheControl: "max-age=3600, stale-while-revalidate=3600",
});

app.get("/view-source", createViewSourceRedirect("vscode"));
app.get("/ping", createPingPongRoute());

app.use("/releases/*", octokitMiddleware);
app.use("/builtin-extensions/*", octokitMiddleware);

app.use("/releases/*", cacheMiddleware);
app.use("/builtin-extensions/*", cacheMiddleware);

app.route("/releases", RELEASES_ROUTER);
app.route("/builtin-extensions", BUILTIN_EXTENSIONS_ROUTER);
app.route("/vsce", VSCE_ROUTER);

app.get(
  "/",
  Scalar({
    url: "/openapi.json",
    layout: "classic",
    customCss: /* css */`
    .tag-section {
      padding: 0 !important;
    }

    .endpoint-label-path {
      display: none !important;
    }

    .show-api-client-button {
      background: var(--theme-color-accent) !important;
    }

    .scalar-codeblock-code {
      display: unset;
    }

    :root {
      --theme-color-accent: rgb(59, 130, 246);
      --theme-color-background: hsla(348, 71%, 93%, 1);
      --scalar-api-client-color: var(--theme-color-accent);
      --scalar-background-1: hsla(241.9, 6.3926%, 10.038%) !important;
    }

    .dark-mode {
      --scalar-background-1: hsla(241.9, 6.3926%, 10.038%) !important;
      --scalar-color-accent: rgb(59, 130, 246) !important;
      --scalar-color-background: hsla(348, 24%, 12%, 1) !important;
      }
    `,
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
