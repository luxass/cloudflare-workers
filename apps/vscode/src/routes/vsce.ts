import type { HonoContext } from "../types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { defaultIgnore, targets, trustedSources } from "../generated-vsce-content";
import { ALLOWED_SVG_SOURCES_ROUTE, DEFAULT_IGNORE_ROUTE, TARGETS_ROUTE } from "./vsce.openapi";

export const VSCE_ROUTER = new OpenAPIHono<HonoContext>();

VSCE_ROUTER.openapi(ALLOWED_SVG_SOURCES_ROUTE, async (c) => {
  return c.json(trustedSources, 200);
});

VSCE_ROUTER.openapi(DEFAULT_IGNORE_ROUTE, async (c) => {
  return c.json(defaultIgnore, 200);
});

VSCE_ROUTER.openapi(TARGETS_ROUTE, async (c) => {
  return c.json(targets, 200);
});
