import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "assets",
  },
  plugins: [
    cloudflareTest({
      experimental: {
        newConfig: true,
      },
      miniflare: {
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
});
