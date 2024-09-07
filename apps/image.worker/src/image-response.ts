import type { HonoElement } from "hono-jsx-to-react";
import type { ImageResponseOptions } from "./types";
import { render } from "./render";

export class ImageResponse extends Response {
  constructor(
    element: string | HonoElement,
    options: ImageResponseOptions,
  ) {
    const extendedOptions = Object.assign(
      {
        width: 1200,
        height: 630,
        debug: false,
      },
      options,
    );

    const result = new ReadableStream({
      async start(controller) {
        if (typeof element === "string") {
          throw new TypeError("Element must be a valid JSX element.");
        }

        const buffer = await render({
          element,
          options: extendedOptions,
        });

        controller.enqueue(buffer);
        controller.close();
      },
    });

    super(result, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": options.debug
          ? "no-cache, no-store"
          : "public, immutable, no-transform, max-age=31536000",
        ...options.headers,
      },
      status: options.status || 200,
      statusText: options.statusText,
    });
  }
}
