import type { HonoContext } from "../types";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { ImageResponse } from "../image-response";
import { font } from "../utils";

export const emojiRouter = new Hono<HonoContext>();

const schema = z.object({
  width: z.coerce.number().min(0).max(1500).default(1200),
  height: z.coerce.number().min(0).max(1500).default(630),
  bgColor: z.string().default("white"),
});

const EMOJIS = [
  "😊",
  "🚀",
  "⭐",
  "🔧",
  "🎉",
  "🔍",
  "📚",
  "🔥",
  "👨‍💻",
  "🔄",
  "🚦",
  "🤔",
  "💡",
  "👍",
  "🌍",
  "💡",
  "🤖",
];

emojiRouter.get(
  "/",
  validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.body(parsed.error.toString(), 400);
    }
    return parsed.data;
  }),
  async (c) => {
    const { bgColor, width, height } = c.req.valid("query");

    const inter400 = await font({
      family: "Inter",
      weight: 400,
    });

    const text = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const bg = `bg-${bgColor}`;

    return new ImageResponse(
      (
        <div
          tw={`${bg} flex h-screen w-screen items-center justify-center p-5 text-center`}
        >
          <p tw="text-[12rem]">{text}</p>
        </div>
      ),
      {
        width,
        height,
        emoji: "twemoji",
        debug: true,
        fonts: [
          {
            name: "Inter",
            weight: 400,
            data: inter400,
          },
        ],
      },
    );
  },
);
