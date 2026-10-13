import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ isPreview }) => ({
  worker: {
    name: "models",
    entrypoint: "src/index.ts",
    compatibilityDate: "2026-04-22",
    compatibilityFlags: ["nodejs_compat"],
    placement: { mode: "smart" },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: false },
    },
    // TODO: Restore enabled/previews_enabled domain flags before deployment.
    // The current cf API only accepts domain names.
    domains: isPreview
      ? ["previews.models.luxass.dev", "previews.models.luxass.com"]
      : ["models.luxass.dev", "models.luxass.com"],
    env: {
      AI: bindings.ai({ dev: { remote: true } }),
      HMAC_SECRET: bindings.secret(),
      DEFAULT_MODEL: bindings.text("@cf/ibm-granite/granite-4.0-h-micro"),
    },
  },
}));
