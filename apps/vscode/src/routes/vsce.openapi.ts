import { ApiErrorSchema } from "@cf-workers/helpers";
import { createRoute, z } from "@hono/zod-openapi";

export const ALLOWED_SVG_SOURCES_ROUTE = createRoute({
  method: "get",
  path: "/allowed-svg-sources",
  tags: ["VSCE"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .array(
              z.string(),
            ),
        },
      },
      description: "Retrieve a list of allowed SVG sources",
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

export const DEFAULT_IGNORE_ROUTE = createRoute({
  method: "get",
  path: "/default-ignore",
  tags: ["VSCE"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .array(
              z.string(),
            ),
        },
      },
      description: "Retrieve a list of default ignore",
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

export const TARGETS_ROUTE = createRoute({
  method: "get",
  path: "/targets",
  tags: ["VSCE"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z
            .array(
              z.string(),
            ),
        },
      },
      description: "Retrieve a list of allowed targets",
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
