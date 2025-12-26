import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject } from "vitest/config";

// eslint-disable-next-line node/prefer-global/process
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const envBindings: Record<string, unknown> = {};

if (GITHUB_TOKEN != null) {
  envBindings.GITHUB_TOKEN = GITHUB_TOKEN;
}

export default defineProject({
  test: {
    name: "vscode",
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ENVIRONMENT: "production",
          ...(envBindings),
        },
      },
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
});
