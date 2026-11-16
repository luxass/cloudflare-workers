import { defineConfig } from "vitest/config";

/**
 * Verify tests run against a deployed Worker over HTTP, not inside workerd.
 * They are kept out of the root vitest projects so `pnpm test` never hits the network.
 *
 *   VERIFY_BASE_URL=https://image.luxass.dev pnpm verify image
 */
export default defineConfig({
  test: {
    name: "verify",
    include: ["*.verify.ts"],
    // waitForWorker() in beforeAll polls for up to 90 seconds.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // These hit the network, so retry once before calling a deployment broken.
    retry: 1,
  },
});
