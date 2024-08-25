import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { graphql } from "@octokit/graphql";
import { apiReference } from "@scalar/hono-api-reference";
import type { Repository, User } from "github-schema";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { PROFILE_QUERY } from "./graphql-queries";
import {
  ApiErrorSchema,
  MosaicRepositorySchema,
} from "./schemas";

export interface HonoContext {
  Bindings: {
    GITHUB_TOKEN: string;
    ENVIRONMENT: string;
    DATABASE: D1Database;
  };
}

const app = new OpenAPIHono<HonoContext>();

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/cloudflare-workers/tree/main/apps/mosaic.worker", 301);
});

app.get("/ping", (c) => {
  c.status(418);
  return c.text("pong!");
});

app.get(
  "/scalar",
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
    server.url = "https://worker.mosaic.luxass.dev";
    server.description = "Production Environment";
  }

  if (c.env.ENVIRONMENT === "preview") {
    server.url = "https://preview.mosaic-worker.luxass.dev";
    server.description = "Preview Environment";
  }

  return {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "A Cloudflare worker that offers a small amount of data about my repositories.",
    },
    tags: [
      {
        name: "Repositories",
        description: "Endpoints to retrieve information about my repositories.",
      },
    ],
    servers: [
      server,
    ],
  };
});

app.use("*", logger());

app.get(
  "*",
  async (c, next) => {
    if (c.env.ENVIRONMENT !== "production" && c.env.ENVIRONMENT !== "preview") {
      return await next();
    }
    const key = c.req.url;
    const cache = await caches.open("mosaic");

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

const REPOSITORIES_ROUTE = createRoute({
  method: "get",
  path: "/repositories",
  tags: ["Repositories"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(MosaicRepositorySchema),
        },
      },
      description: "Retrieve a list of repositories with a `mosaic` config.",
    },
    500: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Internal Server Error",
    },
  },
});

app.openapi(REPOSITORIES_ROUTE, async (c) => {
  const { results } = await c.env.DATABASE.prepare(
    "SELECT * FROM repositories",
  )
    .run();

  return c.json(results.map((row) => {
    if (typeof row.config !== "string") {
      throw new HTTPException(500, {
        message: "Internal Server Error",
      });
    }

    return {
      github_id: row.github_id,
      name_with_owner: row.name_with_owner,
      name: row.name,
      url: row.url,
      description: row.description,
      config: JSON.parse(row.config),
    };
  }));
});

const REPOSITORY_ID_ROUTE = createRoute({
  method: "get",
  path: "/repositories/{github_id}",
  tags: ["Repositories"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: MosaicRepositorySchema,
        },
      },
      description: "Retrieve a repository with a `mosaic` config.",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Bad Request",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Repository not found",
    },
    500: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Internal Server Error",
    },
  },
});

app.openapi(REPOSITORY_ID_ROUTE, async (c) => {
  const githubId = c.req.param("github_id");

  if (!githubId || !githubId.trim()) {
    throw new HTTPException(400, {
      message: "github_id is required",
    });
  }

  try {
    const { results } = await c.env.DATABASE.prepare(
      "SELECT * FROM repositories WHERE github_id = ?",
    )
      .bind(githubId)
      .run();

    if (results.length === 0) {
      throw new HTTPException(404, {
        message: "Repository not found",
      });
    }

    const row = results[0];

    if (typeof row.config !== "string") {
      throw new HTTPException(500, {
        message: "Internal Server Error",
      });
    }

    return c.json({
      github_id: row.github_id,
      name_with_owner: row.name_with_owner,
      name: row.name,
      url: row.url,
      description: row.description,
      config: JSON.parse(row.config),
    });
  } catch (error) {
    console.error("Database query failed:", error);
    throw new HTTPException(500, {
      message: "Internal Server Error",
    });
  }
});

const REPOSITORY_ID_CONFIG_ROUTE = createRoute({
  method: "get",
  path: "/repositories/{github_id}/config",
  tags: ["Repositories"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: MosaicRepositorySchema,
        },
      },
      description: "Retrieve a config of a repository with a `mosaic` config.",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Bad Request",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Repository not found",
    },
    500: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Internal Server Error",
    },
  },
});

app.openapi(REPOSITORY_ID_CONFIG_ROUTE, async (c) => {
  const githubId = c.req.param("github_id");

  if (!githubId || !githubId.trim()) {
    throw new HTTPException(400, {
      message: "github_id is required",
    });
  }

  try {
    const { results } = await c.env.DATABASE.prepare(
      "SELECT json(config) as config FROM repositories WHERE github_id = ?",
    )
      .bind(githubId)
      .run();

    if (results.length === 0) {
      throw new HTTPException(404, {
        message: "Repository not found",
      });
    }

    const row = results[0];

    if (typeof row.config !== "string") {
      throw new HTTPException(500, {
        message: "Internal Server Error",
      });
    }

    return c.json(JSON.parse(row.config));
  } catch (error) {
    console.error("Database query failed:", error);
    throw new HTTPException(500, {
      message: "Internal Server Error",
    });
  }
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

export default {
  fetch: app.fetch,
  scheduled: async (event, env) => {
    const { viewer } = await graphql<{
      viewer: User;
    }>(PROFILE_QUERY, {
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!viewer.repositories.nodes?.length) {
      console.warn("no repositories found");
      return undefined;
    }

    const ignoreFile = await fetch("https://raw.githubusercontent.com/luxass/luxass/main/.github/mosaic/.mosaicignore").then((res) => res.text());
    const ignore = ignoreFile.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

    const repositories = viewer.repositories.nodes.filter((repo): repo is NonNullable<Repository> => {
      return (
        !!repo
        && !repo.isFork
        && !repo.isPrivate
        && !repo.isArchived
        && !ignore.includes(repo.nameWithOwner)
        && !ignore.includes(repo.nameWithOwner.split("/")[1])
      );
    });

    const mosaicUrl = env.ENVIRONMENT === "production" || env.ENVIRONMENT === "preview" ? "https://mosaic.luxass.dev" : "http://localhost:3000";
    // eslint-disable-next-line no-console
    console.info(`will fetch configs from ${mosaicUrl}`);
    // split repositories into chunks of 10
    const chunks = repositories.reduce((acc, _, i) => {
      if (i % 10 === 0) {
        acc.push(repositories.slice(i, i + 10));
      }

      return acc;
    }, [] as Repository[][]);

    // fetch all repositories with configs
    const repositoriesWithConfigs = await Promise.all(chunks.map(async (chunk) => {
      const data = await fetch(`${mosaicUrl}/api/v1/mosaic/resolve-configs`, {
        headers: {
          "X-MOSAIC-REPOSITORIES": chunk.map((repo) => repo.nameWithOwner).join(","),
        },
      }).then((res) => res.json());

      if (!data) {
        return undefined;
      }

      if (!Array.isArray(data) || data.length === 0) {
        return undefined;
      }

      for (const tmp of data) {
        if (tmp.type !== "success") {
          // eslint-disable-next-line no-console
          console.info(`failed to fetch config for ${tmp.repository} reason ${tmp.type}`);
        }
      }

      // filter out objects that doesn't have type "success"
      return data.filter((item) => item.type === "success").map((item) => {
        const repoObj = chunk.find((repo) => repo.nameWithOwner === item.repository);
        if (!repoObj) {
          console.warn(`repository ${item.repository} not found in chunk`, chunk.map((repo) => repo.nameWithOwner));
        }
        return {
          ...repoObj,
          config: item.content,
        };
      });
    })).then((chunks) => chunks.flat());

    // eslint-disable-next-line no-console
    console.log(repositoriesWithConfigs);

    // delete all repositories where github_id is not in the list
    const githubIdsToKeep = repositoriesWithConfigs.map((repo) => repo?.id).filter((id) => id !== undefined);

    // eslint-disable-next-line no-console
    console.info("will delete repositories that doesn't exist in the list", githubIdsToKeep);

    try {
      // delete all repositories where github_id is not in the list
      await env.DATABASE.prepare(
        `DELETE FROM repositories WHERE github_id NOT IN (${githubIdsToKeep.map(() => "?").join(", ")})`,
      )
        .bind(...githubIdsToKeep)
        .run();
    } catch (err) {
      console.error(err);
      return undefined;
    }

    // eslint-disable-next-line no-console
    console.info(`set to handle x${repositoriesWithConfigs.length} repositories`);

    for (const repositoryWithConfig of repositoriesWithConfigs) {
      if (!repositoryWithConfig) {
        console.warn("repository with config is undefined");
        continue;
      }

      try {
        // check if repository already exists
        const { results } = await env.DATABASE.prepare(
          `SELECT * FROM repositories WHERE name_with_owner = ? AND github_id = ? AND url = ?`,
        )
          .bind(repositoryWithConfig.nameWithOwner, repositoryWithConfig.id, repositoryWithConfig.url)
          .run();

        if (results.length > 0) {
          // eslint-disable-next-line no-console
          console.info(`repository ${repositoryWithConfig.nameWithOwner} already exists`);

          const existingRepository = results[0];
          // eslint-disable-next-line no-console
          console.info(`repository ${repositoryWithConfig.nameWithOwner} already exists`);

          // check if the description is different
          if (existingRepository.description !== repositoryWithConfig.description) {
            // update the description
            await env.DATABASE.prepare(
              `UPDATE repositories SET description = ? WHERE name_with_owner = ? AND github_id = ? AND url = ?`,
            )
              .bind(repositoryWithConfig.description, repositoryWithConfig.nameWithOwner, repositoryWithConfig.id, repositoryWithConfig.url)
              .run();
            // eslint-disable-next-line no-console
            console.info(`updated description for repository ${repositoryWithConfig.nameWithOwner}`);
          }

          // check if the config is different
          if (JSON.stringify(existingRepository.config) !== JSON.stringify(repositoryWithConfig.config)) {
            // update the config
            await env.DATABASE.prepare(
              `UPDATE repositories SET config = ? WHERE name_with_owner = ? AND github_id = ? AND url = ?`,
            )
              .bind(JSON.stringify(repositoryWithConfig.config), repositoryWithConfig.nameWithOwner, repositoryWithConfig.id, repositoryWithConfig.url)
              .run();
            // eslint-disable-next-line no-console
            console.info(`updated config for repository ${repositoryWithConfig.nameWithOwner}`);
          }

          continue;
        }

        // insert repository into database
        await env.DATABASE.prepare(
          `INSERT INTO repositories (github_id, name_with_owner, name, url, description, config) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            repositoryWithConfig.id,
            repositoryWithConfig.nameWithOwner,
            repositoryWithConfig.name,
            repositoryWithConfig.url,
            repositoryWithConfig.description,
            JSON.stringify(repositoryWithConfig.config),
          )
          .run();
        // eslint-disable-next-line no-console
        console.info(`inserted repository ${repositoryWithConfig.nameWithOwner}`);
      } catch (error) {
        console.error(`error processing repository ${repositoryWithConfig.nameWithOwner}:`, error);
      }
    }
  },
} satisfies ExportedHandler<HonoContext["Bindings"]>;
