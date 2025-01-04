import type { HonoContext } from "../types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { VSCE_DEFAULT_IGNORE, VSCE_TARGETS, VSCE_TRUSTED_SOURCES } from "../generated-vsce-content";
import { ALLOWED_SVG_SOURCES_ROUTE, DEFAULT_IGNORE_ROUTE, TARGETS_ROUTE } from "./vsce.openapi";

export const VSCE_ROUTER = new OpenAPIHono<HonoContext>();

VSCE_ROUTER.openapi(ALLOWED_SVG_SOURCES_ROUTE, async (c) => {
  return c.json(VSCE_TRUSTED_SOURCES, 200);
});

VSCE_ROUTER.openapi(DEFAULT_IGNORE_ROUTE, async (c) => {
  return c.json(VSCE_DEFAULT_IGNORE, 200);
});

VSCE_ROUTER.openapi(TARGETS_ROUTE, async (c) => {
  return c.json(VSCE_TARGETS, 200);
});
