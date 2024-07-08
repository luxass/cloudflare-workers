import { z } from "@hono/zod-openapi";

export const RELEASE_SCHEMA = z.object({
  tag: z.string(),
  url: z.string(),
  commit: z.string(),
}).openapi("Release");
