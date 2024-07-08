import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { HonoContext, Repository } from "../../types";
import { BUILTIN_QUERY } from "../../utils";
import {
  builtinExtensionRouter,
} from "./[ext]";

export const builtinExtensionsRouter = new OpenAPIHono<HonoContext>();

const route = createRoute({
  method: "get",
  path: "/builtin-extensions",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .object({
              extensions: z.array(
                z.string(),
              ),
            }),
        },
      },
      description: "Retrieve a list of all builtin extensions",
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

builtinExtensionsRouter.openapi(route, async (ctx) => {
  const octokit = ctx.get("octokit");

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
    return ctx.json({
      error: "No builtin extensions found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  return ctx.json({
    extensions: files.entries.filter((entry) => entry.type === "tree").filter((entry) => {
      const { entries } = entry.object;
      if (!entries) {
        return false;
      }

      return entries.some((entry) => entry.name === "package.json" && entry.type === "blob");
    }).map((entry) => entry.name),
  });
});

builtinExtensionsRouter.route("/builtin-extensions", builtinExtensionRouter);
