import { createRoute } from "@hono/zod-openapi";
import { z } from "zod";
import { ApiErrorSchema, MosaicRepositorySchema } from "./schemas";

export const REPOSITORIES_ROUTE = createRoute({
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

export const REPOSITORY_ID_ROUTE = createRoute({
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

export const REPOSITORY_ID_CONFIG_ROUTE = createRoute({
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
