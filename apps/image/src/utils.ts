import type { FontWeight } from "satori";
import { z } from "zod";

type Primitives = string | number | boolean | null;
type JsonValue = Primitives | JsonValue[] | { [key: string]: JsonValue };

const jsonStr = z.string().transform<unknown>((str, ctx) => {
  try {
    return JSON.parse(str) as JsonValue;
  } catch {
    ctx.addIssue({ code: "custom", message: "Needs to be JSON" });
  }
});

export function params<TSchema extends z.ZodTypeAny>(schema: TSchema) {
  const querySchema = z.object({
    input: jsonStr.pipe(schema),
  });
  return {
    decodeRequest: (req: Request) => {
      const url = new URL(req.url);
      const obj = Object.fromEntries(url.searchParams.entries());

      return querySchema.safeParse(obj);
    },
    toSearchString: (obj: z.input<TSchema>) => {
      schema.parse(obj);
      return `input=${encodeURIComponent(JSON.stringify(obj))}`;
    },
    schema,
  };
}

export function truncateWords(str: string, maxCharacters: number) {
  if (str.length <= maxCharacters) {
    return str;
  }
  // break at closest word
  const truncated = str.slice(0, maxCharacters);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace)}…`;
}

export const FONT_PARAMS = params(
  z.object({
    family: z.string(),
    weight: z.number().default(400),
    text: z.string().optional(),
  }),
);

export interface FontOptions {
  family: string;
  weight?: FontWeight;
  text?: string;
}

export async function font({ family, weight, text }: FontOptions & {
  HOST?: string;
}) {
  const res = await fetch(
    `https://assets.luxass.dev/api/fonts/${family}/${weight}${text ? `?text=${text}` : ""}`,
  );

  return await res.arrayBuffer();
}
