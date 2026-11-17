import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "models",
  },
  plugins: [
    cloudflareTest({
      config: true,
      remoteBindings: false,
      miniflare: {
        bindings: {
          AI: {},
          HMAC_SECRET: "models-unit-test-secret",
          DEFAULT_MODEL: "@cf/test/model",
        },
      },
    }),
  ],
});
