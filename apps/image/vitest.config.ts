import { readFileSync } from "node:fs";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

import type { ImageTestFixtures } from "./test/fixtures.ts";

function fixtureBase64(name: string): string {
  return readFileSync(new URL(`./test/fixtures/${name}`, import.meta.url)).toString("base64");
}

const imageFixtures: ImageTestFixtures = {
  fonts: {
    "400": fixtureBase64("inter-400.ttf"),
    "700": fixtureBase64("inter-700.ttf"),
    "900": fixtureBase64("inter-900.ttf"),
  },
  logoPng: fixtureBase64("logo.png"),
  logoSvg: readFileSync(new URL("./test/fixtures/logo.svg", import.meta.url), "utf8"),
  emojiSvg: readFileSync(new URL("./test/fixtures/emoji.svg", import.meta.url), "utf8"),
};

export default defineProject({
  test: {
    name: "image",
    provide: { imageFixtures },
  },
  plugins: [
    cloudflareTest({
      config: true,
      remoteBindings: false,
      miniflare: {
        bindings: {
          GITHUB_TOKEN: "image-unit-test-token",
        },
      },
    }),
  ],
});
