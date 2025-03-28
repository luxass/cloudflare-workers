// @ts-check
import { luxass } from "@luxass/eslint-config";

export default luxass({
  formatters: true,
}, {
  ignores: [
    "**/trusted-svg-sources.ts",
    "worker-configuration.d.ts",
  ],
});
