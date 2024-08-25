import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import type { HonoContext } from "../types";
import { ImageResponse, font, truncateWords } from "../utils";

export const postImageRouter = new Hono<HonoContext>();

const schema = z.object({
  title: z
    .string()
    .transform((str) => truncateWords(str, 70))
    .default("No title"),
  description: z
    .string()
    .transform((str) => truncateWords(str, 145))
    .default("No description"),
  date: z
    .string()
    .default(new Date().toISOString())
    .transform((val) => new Date(val))
    .transform((date) =>
      Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(date),
    ),
});

postImageRouter.get(
  "/",
  validator("query", (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.body(parsed.error.toString(), 400);
    }
    return parsed.data;
  }),
  async (c) => {
    const { title, description, date } = c.req.valid("query");

    const [inter900, inter700, inter400] = await Promise.all([
      font({
        family: "Inter",
        weight: 900,
      }),
      font({
        family: "Inter",
        weight: 700,
      }),
      font({
        family: "Inter",
        weight: 400,
      }),
    ]);

    return new ImageResponse(
      (
        <div tw="flex h-full w-full flex-col bg-neutral-900 bg-cover p-14 text-white">
          <div tw="flex h-full w-full flex-col justify-between">
            <div tw="flex w-full flex-col">
              <div tw="flex w-full items-center justify-between">
                <div tw="flex flex-1 flex-col pr-6">
                  <p tw="text-2xl font-semibold text-blue-500">{date}</p>
                  <h1 tw="my-0 py-0 text-6xl font-extrabold leading-tight">
                    {title}
                  </h1>
                </div>
              </div>
              <p tw="text-3xl leading-snug text-neutral-300">{description}</p>
            </div>
            <div tw="flex items-center">
              <img
                src="https://assets.luxass.dev/logos/dino.png"
                alt="author profile"
                width="75px"
                height="75px"
                tw="mr-6 rounded-xl"
              />
              <div tw="flex flex-col justify-center">
                <p tw="text-2xl font-semibold leading-[1px]">luxass.dev</p>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 600,
        fonts: [
          { name: "Inter", data: inter900, weight: 900 },
          { name: "Inter", data: inter700, weight: 700 },
          { name: "Inter", data: inter400, weight: 400 },
        ],
      },
    );
  },
);
