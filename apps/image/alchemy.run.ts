import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "image",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stack = yield* Stack;
    const environment =
      stack.stage === "production" || stack.stage === "preview" ? stack.stage : undefined;

    let domain: { name: string; aliases: string[] } | undefined;

    if (stack.stage === "production") {
      domain = {
        name: "image.luxass.dev",
        aliases: ["image.luxass.com"],
      };
    }

    if (stack.stage === "preview") {
      domain = {
        name: "preview.image.luxass.dev",
        aliases: ["preview.image.luxass.com"],
      };
    }

    const worker = yield* Cloudflare.Worker("Worker", {
      name: stack.stage === "production" ? "image" : `image-${stack.stage}`,
      main: new URL("./src/index.ts", import.meta.url).href,
      compatibility: {
        date: "2025-12-19",
        flags: ["nodejs_compat"],
      },
      domain: domain,
      env: {
        ...(environment ? { ENVIRONMENT: environment } : {}),
        GITHUB_TOKEN: Config.redacted("IMAGE_GITHUB_TOKEN"),
      },
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          invocationLogs: false,
        },
      },
      placement: { mode: "smart" },
      workersDev: {
        enabled: true,
        previewsEnabled: false,
      },
    }).pipe(adopt(stack.stage === "production" || stack.stage === "preview"));

    return {
      url: worker.url,
      workerName: worker.workerName,
    };
  }),
);
