import { ApiErrorSchema } from "@cf-workers/helpers";
import { createRoute, z } from "@hono/zod-openapi";
import { ReleaseSchema } from "../schemas";

export const ALL_RELEASES_ROUTE = createRoute({
  method: "get",
  path: "/",
  tags: ["Releases"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .array(
              ReleaseSchema,
            ),
        },
      },
      description: "Retrieve a list of all releases",
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

export const LATEST_RELEASE_ROUTE = createRoute({
  method: "get",
  path: "/latest",
  tags: ["Releases"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ReleaseSchema,
        },
      },
      description: "Get the latest release",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No release found",
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

export const RELEASE_ROUTE = createRoute({
  method: "get",
  path: "/{tag}",
  tags: ["Releases"],
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
          schema: ReleaseSchema,
        },
      },
      description: "Get the latest release",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No release tag provided",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No release found",
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
