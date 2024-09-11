import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

// eslint-disable-next-line node/prefer-global/process
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export default defineWorkersProject({
  test: {
    name: "vscode",
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            ENVIRONMENT: "production",
            GITHUB_TOKEN: GITHUB_TOKEN!,
          },
        },
        wrangler: {
          configPath: "./wrangler.toml",
        },
      },
    },
  },
});
