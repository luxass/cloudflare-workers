import type { HonoElement } from "hono-jsx-to-react";
import type { ImageResponseOptions } from "./types";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { toReactNode } from "hono-jsx-to-react";
import satori, { init } from "satori";
import initYoga from "yoga-wasm-web";
import { getIconCode, loadEmoji } from "./emoji";
// @ts-expect-error .wasm files are not typed
import resvgWasm from "./resvg.wasm";
import { font } from "./utils";

async function initResvgWasm() {
  try {
    await initWasm(resvgWasm as WebAssembly.Module);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Already initialized")) {
      return;
    }
    throw err;
  }
}

interface RenderOptions {
  /**
   * The React element to render into an image.
   * @example
   * ```tsx
   * <div
   *  style={{
   *    display: 'flex',
   *  }}
   * >
   *  <h1>Hello World</h1>
   * </div>
   * ```
   * @example
   * ```html
   * <div style="display:flex;"><h1>Hello World</h1></div>
   * ```
   */
  element: string | HonoElement;
  /**
   * The options for the image response.
   */
  options: ImageResponseOptions;
}

export async function render({ element, options }: RenderOptions) {
  await initResvgWasm();

  const width = options.width;
  const height = options.height;

  let widthHeight:
    | { width: number; height: number }
    | { width: number }
    | { height: number } = {
      width: 1200,
      height: 630,
    };

  if (width && height) {
    widthHeight = { width, height };
  } else if (width) {
    widthHeight = { width };
  } else if (height) {
    widthHeight = { height };
  }

  const svg = await satori(toReactNode(element), {
    ...widthHeight,
    fonts: options?.fonts?.length
      ? options.fonts
      : [
          {
            name: "Inter",
            data: await font({
              family: "Inter",
              weight: 500,
            }),
            weight: 500,
            style: "normal",
          },
        ],
    async loadAdditionalAsset(languageCode, segment) {
      if (languageCode === "emoji") {
        return `data:image/svg+xml;base64,${btoa(await (await loadEmoji(getIconCode(segment), "twemoji")).text())}`;
      }

      console.error("Unsupported language code", languageCode, segment);

      throw new Error("Unsupported language code");
    },
  });

  const resvg = new Resvg(svg, {
    fitTo:
      "width" in widthHeight
        ? {
            mode: "width" as const,
            value: widthHeight.width,
          }
        : {
            mode: "height" as const,
            value: widthHeight.height,
          },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return pngBuffer;
}
