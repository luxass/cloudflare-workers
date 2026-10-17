import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "image",
    entrypoint,
    compatibilityDate: "2025-12-19",
    compatibilityFlags: ["nodejs_compat"],
    placement: { mode: "smart" },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false },
    },
    domains: [
      { hostname: "image.luxass.dev", production: true, previews: false },
      { hostname: "image.luxass.com", production: true, previews: false },
      {
        hostname: "previews.image.luxass.dev",
        production: false,
        previews: true,
      },
      {
        hostname: "previews.image.luxass.com",
        production: false,
        previews: true,
      },
    ],
    env: {
      ENVIRONMENT: bindings.text(isPreview ? "preview" : "production"),
      GITHUB_TOKEN: bindings.secret(),
    },
  },
}));
