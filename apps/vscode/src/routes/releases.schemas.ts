import { z } from "@hono/zod-openapi";

export const ReleaseSchema = z.object({
  tag: z.string().openapi({
    description: "The tag of the release",
  }),
  url: z.string().openapi({
    description: "The URL of the release",
  }),
  commit: z.string().optional().openapi({
    description: "The commit SHA of the release",
  }),
}).meta({
  name: "Release",
  description: "A release of the VS Code extension",
});

export const ReleasesArraySchema = z.array(ReleaseSchema).openapi({
  description: "An array of releases",
});
