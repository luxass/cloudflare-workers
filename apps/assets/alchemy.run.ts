import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "assets",
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
        name: "assets.luxass.dev",
        aliases: ["assets.luxass.com"],
      };
    }

    if (stack.stage === "preview") {
      domain = {
        name: "preview.assets.luxass.dev",
        aliases: ["preview.assets.luxass.com"],
      };
    }

    const worker = yield* Cloudflare.Worker("Worker", {
      name: stack.stage === "production" ? "assets" : `assets-${stack.stage}`,
      main: new URL("./src/index.ts", import.meta.url).href,
      compatibility: {
        date: "2025-03-13",
      },
      domain,
      env: environment ? { ENVIRONMENT: environment } : {},
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
