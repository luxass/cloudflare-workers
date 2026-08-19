import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "models",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stack = yield* Stack;
    const domain =
      stack.stage === "production"
        ? {
            name: "models.luxass.dev",
            aliases: ["models.luxass.com"],
          }
        : undefined;

    const worker = yield* Cloudflare.Worker("Worker", {
      name: stack.stage === "production" ? "models" : `models-${stack.stage}`,
      main: new URL("./src/index.ts", import.meta.url).href,
      compatibility: {
        date: "2026-04-22",
        flags: ["nodejs_compat"],
      },
      domain,
      env: {
        AI: Cloudflare.Workers.AI(),
        DEFAULT_MODEL: "@cf/qwen/qwen3-30b-a3b-fp8",
        HMAC_SECRET: Config.redacted("MODELS_HMAC_SECRET"),
      },
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          invocationLogs: false,
        },
      },
      placement: { mode: "smart" },
    }).pipe(adopt(stack.stage === "production"));

    return {
      url: worker.url,
      workerName: worker.workerName,
    };
  }),
);
