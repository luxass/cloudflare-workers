import { z } from "@hono/zod-openapi";
import { VSCE_DEFAULT_IGNORE, VSCE_TARGETS, VSCE_TRUSTED_SOURCES } from "../generated-vsce-content";

export const AllowedSvgSourcesSchema = z.array(
  z.enum([...VSCE_TRUSTED_SOURCES]),
).openapi({
  description: "An array of allowed SVG sources",
});

export const DefaultIgnoreSchema = z.array(
  z.enum([...VSCE_DEFAULT_IGNORE]),
).openapi({
  description: "An array of default ignore patterns",
});

export const TargetsSchema = z.array(
  z.enum([...VSCE_TARGETS]),
).openapi({
  description: "An array of allowed targets",
});
