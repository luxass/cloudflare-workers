import { ApiErrorSchema } from "@cf-workers/helpers";
import { createRoute, z } from "@hono/zod-openapi";

export const ALLOWED_SVG_SOURCES_ROUTE = createRoute({
  method: "get",
  path: "/allowed-svg-sources",
  tags: ["Misc"],
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
