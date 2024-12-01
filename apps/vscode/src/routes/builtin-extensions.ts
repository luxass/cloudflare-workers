import { OpenAPIHono } from "@hono/zod-openapi";
import { createError } from "@cf-workers/helpers";
import type { HonoContext, Repository } from "../types";
import { BUILTIN_QUERY, base64ToRawText, getBuiltinExtensionFiles, translate } from "../utils";
import { BuiltinExtensionSchema } from "../schemas";
import { ALL_BUILTIN_EXTENSIONS_ROUTE, BUILTIN_EXTENSION_CONFIGURATION_ROUTE, BUILTIN_EXTENSION_CONTRIBUTES_ROUTE, BUILTIN_EXTENSION_ROUTE } from "./builtin-extensions.openapi";

type BuiltinExtensionHonoContext = HonoContext & {
  Variables: {
    builtinExtensionName: string;
    builtinExtension: Record<string, unknown>;
  };
};

export const BUILTIN_EXTENSIONS_ROUTER = new OpenAPIHono<BuiltinExtensionHonoContext>();

BUILTIN_EXTENSIONS_ROUTER.openapi(ALL_BUILTIN_EXTENSIONS_ROUTE, async (c) => {
  const octokit = c.get("octokit");

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const {
    repository: {
      object: files,
    },
  } = await octokit.graphql<{
    repository: Repository;
  }>(BUILTIN_QUERY, {
    path: "HEAD:extensions",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!files.entries) {
    return createError(c, 404, "No builtin extensions found");
  }

  return c.json({
    extensions: files.entries.filter((entry) => entry.type === "tree").filter((entry) => {
      const { entries } = entry.object;
      if (!entries) {
        return false;
      }

      return entries.some((entry) => entry.name === "package.json" && entry.type === "blob");
    }).map((entry) => entry.name),
  }, 200);
});

BUILTIN_EXTENSIONS_ROUTER.use("/:ext/*", async (c, next) => {
  const octokit = c.get("octokit");

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const params = c.req.param();
  if (!params || !params.ext) {
    return createError(c, 400, "No extension name provided");
  }

  const extName = params.ext;

  const files = await getBuiltinExtensionFiles(
    octokit,
    `extensions/${extName}`,
  );

  if (!files || !("entries" in files) || !files.entries) {
    return createError(c, 404, `No builtin extensions found for ${extName}`);
  }

  const pkgEntry = files.entries.find((entry) => entry.name === "package.json");
  if (!pkgEntry) {
    return createError(c, 404, `No \`package.json\` found for ${extName}`);
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
    return createError(c, 404, `No \`package.json\` found for ${extName}`);
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
      return createError(c, 404, `No \`package.nls.json\` found for ${extName}`);
    }

    const pkgNLSJSON = JSON.parse(base64ToRawText(pkgNLSJSONData.content));

    result = translate(pkg, pkgNLSJSON);
  }

  c.set("builtinExtensionName", extName);
  c.set("builtinExtension", result);
  await next();
});

BUILTIN_EXTENSIONS_ROUTER.openapi(BUILTIN_EXTENSION_ROUTE, async (c) => {
  const octokit = c.get("octokit");

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const extName = c.req.param("ext");
  if (!extName) {
    return createError(c, 400, "No extension name provided");
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
    return createError(c, 404, `No builtin extension found for ${extName}`);
  }

  const pkgEntry = files.entries.find((entry) => entry.name === "package.json");
  if (!pkgEntry) {
    return createError(c, 404, `No builtin extension found for ${extName}`);
  }

  const { data: pkgJSONData } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner: "microsoft",
    repo: "vscode",
    path: pkgEntry.path,
  });

  if (Array.isArray(pkgJSONData)) {
    return createError(c, 404, `No builtin extension found for ${extName}`);
  }

  if (pkgJSONData.type !== "file") {
    return createError(c, 404, `No builtin extension found for ${extName}`);
  }

  const parsedPkgJSON = await BuiltinExtensionSchema.safeParseAsync(JSON.parse(base64ToRawText(pkgJSONData.content)));

  if (!parsedPkgJSON.success) {
    return createError(c, 500, "failed to parse builtin extension");
  }

  const pkgJSON = parsedPkgJSON.data;

  let result = pkgJSON;

  const shouldTranslate = c.req.query("translate") === "true" || c.req.query("translate") === "";

  if (shouldTranslate) {
    const pkgNLSEntry = files.entries.find((entry) => entry.name === "package.nls.json");

    if (pkgNLSEntry) {
      const { data: pkgNLSJSONData } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: "microsoft",
        repo: "vscode",
        path: pkgNLSEntry.path,
      });

      if (Array.isArray(pkgNLSJSONData)) {
        return createError(c, 404, `No builtin extension found for ${extName}`);
      }

      if (pkgNLSJSONData.type !== "file") {
        return createError(c, 404, `No builtin extension found for ${extName}`);
      }
      const pkgNLSJSON = JSON.parse(base64ToRawText(pkgNLSJSONData.content));

      result = translate(pkgJSON, pkgNLSJSON);
    }
  }

  return c.json(result, 200);
});

BUILTIN_EXTENSIONS_ROUTER.openapi(BUILTIN_EXTENSION_CONTRIBUTES_ROUTE, async (c) => {
  const ext = c.get("builtinExtension");
  const params = c.req.param();
  if (!params || !params.ext) {
    return createError(c, 400, "No extension name provided");
  }

  if (!ext) {
    return createError(c, 404, "No builtin extension found");
  }

  // check if the extension has a contributes field
  if (!("contributes" in ext)) {
    return createError(c, 404, "No contributes found for builtin extension");
  }

  return c.json(ext.contributes as never, 200);
});

BUILTIN_EXTENSIONS_ROUTER.openapi(BUILTIN_EXTENSION_CONFIGURATION_ROUTE, async (c) => {
  const ext = c.get("builtinExtension");
  const params = c.req.param();
  if (!params || !params.ext) {
    return createError(c, 400, "No extension name provided");
  }

  if (!ext) {
    return createError(c, 404, "No builtin extension found");
  }

  // check if the extension has a contributes field
  if (!("contributes" in ext)) {
    return createError(c, 404, "No contributes found for builtin extension");
  }

  // check if the extension has a configuration field
  if (typeof ext.contributes === "object" && ext.contributes != null && !("configuration" in ext.contributes)) {
    return createError(c, 404, "No configuration found for builtin extension");
  }

  return c.json((ext.contributes as any).configuration as never, 200);
});
