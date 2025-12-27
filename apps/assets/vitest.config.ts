import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "assets",
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ENVIRONMENT: "production",
        },
      },
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
});
