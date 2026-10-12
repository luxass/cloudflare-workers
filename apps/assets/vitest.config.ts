import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

import cloudflareConfig from "./cloudflare.config.ts";

const { worker } = cloudflareConfig({ isPreview: false, mode: "test" });

export default defineProject({
  test: {
    name: "assets",
  },
  plugins: [
    cloudflareTest({
      main: worker.entrypoint,
      miniflare: {
        compatibilityDate: worker.compatibilityDate,
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          ENVIRONMENT: worker.env.ENVIRONMENT.value,
        },
      },
    }),
  ],
});
