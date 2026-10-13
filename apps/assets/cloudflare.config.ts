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
    // TODO: Restore enabled/previews_enabled domain flags before deployment.
    // The current cf API only accepts domain names.
    domains: isPreview
      ? ["previews.assets.luxass.dev", "previews.assets.luxass.com"]
      : ["assets.luxass.dev", "assets.luxass.com"],
    env: {
      ENVIRONMENT: bindings.text(isPreview ? "preview" : "production"),
    },
  },
}));
