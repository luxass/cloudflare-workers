import { z } from "@hono/zod-openapi";

export const MosaicConfigSchema = z.object({

}).openapi("MosaicConfig", {
  description: "The configuration of the mosaic",
});

export const MosaicRepositorySchema = z.object({
  github_id: z.string().openapi({
    description: "The GitHub ID of the repository",
  }),
  name_with_owner: z.string().openapi({
    description: "The name of the repository with the owner",
  }),
  name: z.string().openapi({
    description: "The name of the repository",
  }),
  url: z.string().openapi({
    description: "The URL of the repository",
  }),
  description: z.string().openapi({
    description: "The description of the repository",
  }),
  config: MosaicConfigSchema,
}).openapi("MosaicRepository");
