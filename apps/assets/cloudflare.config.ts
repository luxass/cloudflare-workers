import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "assets",
    entrypoint: "src/index.ts",
    compatibilityDate: "2025-03-13",
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
