import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "assets",
    entrypoint,
    compatibilityDate: "2026-10-01",
    placement: { mode: "smart" },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false },
    },
    domains: [
      { hostname: "assets.luxass.dev", production: true, previews: false },
      { hostname: "assets.luxass.com", production: true, previews: false },
      {
        hostname: "previews.assets.luxass.dev",
        production: false,
        previews: true,
      },
      {
        hostname: "previews.assets.luxass.com",
        production: false,
        previews: true,
      },
    ],
    env: {
      ENVIRONMENT: bindings.text(isPreview ? "preview" : "production"),
    },
  },
}));
