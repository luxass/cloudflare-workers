import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "models",
    entrypoint,
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    placement: { mode: "smart" },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false },
    },
    domains: [
      { hostname: "models.luxass.dev", production: true, previews: false },
      { hostname: "models.luxass.com", production: true, previews: false },
      {
        hostname: "previews.models.luxass.dev",
        production: false,
        previews: true,
      },
      {
        hostname: "previews.models.luxass.com",
        production: false,
        previews: true,
      },
    ],
    env: {
      AI: bindings.ai({ dev: { remote: true } }),
      HMAC_SECRET: bindings.secret(),
      DEFAULT_MODEL: bindings.text("@cf/ibm-granite/granite-4.0-h-micro"),
    },
  },
});
