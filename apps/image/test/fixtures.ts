import "vitest";

/** Local fixture data passed from Vitest's Node process into the Workers runtime. */
export interface ImageTestFixtures {
  fonts: Record<"400" | "700" | "900", string>;
  logoPng: string;
  logoSvg: string;
  emojiSvg: string;
}

declare module "vitest" {
  interface ProvidedContext {
    imageFixtures: ImageTestFixtures;
  }
}
