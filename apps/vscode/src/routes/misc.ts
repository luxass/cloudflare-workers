import type { HonoContext } from "../types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { trustedSources } from "../trusted-svg-sources";
import { ALLOWED_SVG_SOURCES_ROUTE } from "./misc.openapi";

export const MISC_ROUTER = new OpenAPIHono<HonoContext>();

MISC_ROUTER.openapi(ALLOWED_SVG_SOURCES_ROUTE, async (c) => {
  return c.json(trustedSources, 200);
});
