import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { HonoContext, Repository } from "../../types";
import { BUILTIN_QUERY, base64ToRawText, getBuiltinExtensionFiles, translate } from "../../utils";

type BuiltinExtensionHonoContext = HonoContext & {
  Variables: {
    builtinExtensionName: string;
    builtinExtension: Record<string, unknown>;
  };
};

export const builtinExtensionRouter = new OpenAPIHono<BuiltinExtensionHonoContext>();

builtinExtensionRouter.use("/:ext/*", async (ctx, next) => {
  const octokit = ctx.get("octokit");
  const params = ctx.req.param();
  if (!params || !params.ext) {
    return ctx.notFound();
  }

  const extName = params.ext;

  const files = await getBuiltinExtensionFiles(
    octokit,
    `extensions/${extName}`,
  );

  if (!files || !("entries" in files) || !files.entries) {
    return ctx.notFound();
  }

  const pkgEntry = files.entries.find((entry) => entry.name === "package.json");
  if (!pkgEntry) {
    return ctx.notFound();
  }

  const { data: pkgJSONData } = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner: "microsoft",
      repo: "vscode",
      path: pkgEntry.path!,
    },
  );

  if (Array.isArray(pkgJSONData) || pkgJSONData.type !== "file") {
    return ctx.notFound();
  }

  const pkg = JSON.parse(base64ToRawText(pkgJSONData.content));

  let result = pkg;
  const pkgNLSEntry = files.entries.find(
    (entry) => entry.name === "package.nls.json",
  );

  if (pkgNLSEntry) {
    const { data: pkgNLSJSONData } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: "microsoft",
        repo: "vscode",
        path: pkgNLSEntry.path!,
      },
    );

    if (Array.isArray(pkgNLSJSONData) || pkgNLSJSONData.type !== "file") {
      return ctx.notFound();
    }

    const pkgNLSJSON = JSON.parse(base64ToRawText(pkgNLSJSONData.content));

    result = translate(pkg, pkgNLSJSON);
  }

  ctx.set("builtinExtensionName", extName);
  ctx.set("builtinExtension", result);
  await next();
});

const route = createRoute({
  method: "get",
  path: "/{ext}",
  request: {
    params: z.object({
      ext: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .unknown(),
        },
      },
      description: "Retrieve a specific builtin extension",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "No builtin extensions found",
    },
  },
});

builtinExtensionRouter.openapi(route, async (ctx) => {
  const octokit = ctx.get("octokit");

  const extName = ctx.req.param("ext");
  if (!extName) {
    return ctx.json({
      error: "No extension name provided",
    }, 400, {
      "Content-Type": "application/json",
    });
  }

  const {
    repository: {
      object: files,
    },
  } = await octokit.graphql<{
    repository: Repository;
  }>(BUILTIN_QUERY, {
    path: `HEAD:extensions/${extName}`,
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!files) {
    return ctx.json({
      error: `No builtin extension found for ${extName}`,
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const pkgEntry = files.entries.find((entry) => entry.name === "package.json");
  if (!pkgEntry) {
    return ctx.json({
      error: `No builtin extension found for ${extName}`,
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const { data: pkgJSONData } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner: "microsoft",
    repo: "vscode",
    path: pkgEntry.path,
  });

  if (Array.isArray(pkgJSONData)) {
    return ctx.json({
      error: `No builtin extension found for ${extName}`,
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  if (pkgJSONData.type !== "file") {
    return ctx.json({
      error: `No builtin extension found for ${extName}`,
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const pkgJSON = JSON.parse(base64ToRawText(pkgJSONData.content));

  let result = pkgJSON;
  const pkgNLSEntry = files.entries.find((entry) => entry.name === "package.nls.json");

  if (pkgNLSEntry) {
    const { data: pkgNLSJSONData } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: "microsoft",
      repo: "vscode",
      path: pkgNLSEntry.path,
    });

    if (Array.isArray(pkgNLSJSONData)) {
      return ctx.json({
        error: `No builtin extension found for ${extName}`,
      }, 404, {
        "Content-Type": "application/json",
      });
    }

    if (pkgNLSJSONData.type !== "file") {
      return ctx.json({
        error: `No builtin extension found for ${extName}`,
      }, 404, {
        "Content-Type": "application/json",
      });
    }
    const pkgNLSJSON = JSON.parse(base64ToRawText(pkgNLSJSONData.content));

    result = translate(pkgJSON, pkgNLSJSON);
  }

  return ctx.json(result);
});

const contributesRoute = createRoute({
  method: "get",
  path: "/{ext}/contributes",
  request: {
    params: z.object({
      ext: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .record(z.unknown()),
        },
      },
      description: "Retrieve a list of contributes for a specific builtin extension",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "No builtin extensions found",
    },
  },
});

builtinExtensionRouter.openapi(contributesRoute, async (ctx) => {
  const ext = ctx.get("builtinExtension");
  if (!ext) {
    return ctx.json({
      error: "No builtin extension found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  return ctx.json(ext.contributes);
});

const configurationRoute = createRoute({
  method: "get",
  path: "/{ext}/configuration",
  request: {
    params: z.object({
      ext: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.unknown(),
        },
      },
      description: "Retrieve the package.json for a specific builtin extension",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "No builtin extensions found",
    },
  },
});

builtinExtensionRouter.openapi(configurationRoute, async (ctx) => {
  const ext = ctx.get("builtinExtension");
  if (
    !ext
    || !("contributes" in ext)
    || !ext.contributes
    || typeof ext.contributes !== "object"
    || !("configuration" in ext.contributes)
    || !ext.contributes.configuration
  ) {
    return ctx.json({
      error: "No builtin extension found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  return ctx.json(ext.contributes.configuration);
});
