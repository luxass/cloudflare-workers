import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import semver from "semver";
import type { HonoContext } from "../types";
import { RELEASE_SCHEMA } from "../schemas";

export const releasesRouter = new OpenAPIHono<HonoContext>();

const releasesRoute = createRoute({
  method: "get",
  path: "/releases",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .array(
              z.object({
                tag: z.string(),
                url: z.string(),
              }),
            ),
        },
      },
      description: "Retrieve a list of all releases",
    },
  },
});

releasesRouter.openapi(releasesRoute, async (ctx) => {
  const octokit = ctx.get("octokit");

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => semver.gte(release.tag_name, "1.45.0")));

  return ctx.json(
    releases.map((release) => ({
      tag: release.tag_name,
      url: release.url,
    })),
    200,
    {
      "Content-Type": "application/json",
    },
  );
});

const latestReleaseRoute = createRoute({
  method: "get",
  path: "/releases/latest",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RELEASE_SCHEMA,
        },
      },
      description: "Get the latest release",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "No release found",
    },
  },
});

releasesRouter.openapi(latestReleaseRoute, async (ctx) => {
  const octokit = ctx.get("octokit");

  const { data: releases } = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 1,
  });

  const release = releases[0];
  if (!("tag_name" in release)) {
    return ctx.json({
      error: "No release found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return ctx.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200, {
    "Content-Type": "application/json",
  });
});

const releaseRoute = createRoute({
  method: "get",
  path: "/releases/{tag}",
  parameters: [
    {
      in: "path",
      name: "tag",
      required: true,
      example: "1.87.0",
    },
  ],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RELEASE_SCHEMA,
        },
      },
      description: "Get the latest release",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "No release found",
    },
  },
});

releasesRouter.openapi(releaseRoute, async (ctx) => {
  const octokit = ctx.get("octokit");

  const params = ctx.req.param();
  if (!params || !params.tag) {
    return ctx.json({
      error: "No release found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => semver.gte(release.tag_name, "1.45.0")));

  const release = releases.find((release) => release.tag_name === params.tag);

  if (!release) {
    return ctx.json({
      error: "No release found",
    }, 404, {
      "Content-Type": "application/json",
    });
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return ctx.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200, {
    "Content-Type": "application/json",
  });
});
