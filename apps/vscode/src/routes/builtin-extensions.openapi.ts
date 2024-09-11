import { createRoute, z } from "@hono/zod-openapi";
import { ApiErrorSchema } from "@cf-workers/helpers";
import { BuiltinExtensionSchema, BuiltinExtensionsSchema } from "../schemas";

export const ALL_BUILTIN_EXTENSIONS_ROUTE = createRoute({
  method: "get",
  path: "/",
  tags: ["Builtin Extensions"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BuiltinExtensionsSchema,
        },
      },
      description: "Retrieve a list of all builtin extensions",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No builtin extensions found",
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

export const BUILTIN_EXTENSION_ROUTE = createRoute({
  method: "get",
  path: "/{ext}",
  tags: ["Builtin Extensions"],
  parameters: [
    {
      in: "path",
      name: "ext",
      required: true,
      example: "git",
    },
    {
      in: "query",
      name: "translate",
      required: false,
      schema: {
        type: "boolean",
        default: false,
      },
      description: "Whether or not the package.json should be substituted using `package.nls.json` (Experimental)\n\nIf no `package.nls.json` is found, the original `package.json` will be returned without being translated.",
    },
  ],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BuiltinExtensionSchema,
        },
      },
      description: "Retrieve a specific builtin extension",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Invalid extension name",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No builtin extensions found",
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

export const BUILTIN_EXTENSION_CONTRIBUTES_ROUTE = createRoute({
  method: "get",
  path: "/{ext}/contributes",
  tags: ["Builtin Extensions"],
  parameters: [
    {
      in: "path",
      name: "ext",
      required: true,
      example: "git",
    },
  ],
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
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Invalid extension name",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No builtin extensions found",
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

export const BUILTIN_EXTENSION_CONFIGURATION_ROUTE = createRoute({
  method: "get",
  path: "/{ext}/configuration",
  tags: ["Builtin Extensions"],
  parameters: [
    {
      in: "path",
      name: "ext",
      required: true,
      example: "git",
    },
  ],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.unknown(),
        },
      },
      description: "Retrieve the package.json for a specific builtin extension",
    },
    400: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "Invalid extension name",
    },
    404: {
      content: {
        "application/json": {
          schema: ApiErrorSchema,
        },
      },
      description: "No builtin extensions found",
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
