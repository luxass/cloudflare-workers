import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const NOTIFICATIONS_KV_NAMESPACE_ID = "4a30c06e45f04174942becfaad4ea18c";

export default Alchemy.Stack(
  "notifications",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stack = yield* Stack;
    const notificationsKvNamespaceId =
      stack.stage === "production"
        ? NOTIFICATIONS_KV_NAMESPACE_ID
        : (yield* Cloudflare.KV.Namespace("NotificationsKV")).namespaceId;

    const worker = yield* Cloudflare.Worker("Worker", {
      name: stack.stage === "production" ? "notifications" : `notifications-${stack.stage}`,
      main: new URL("./src/index.ts", import.meta.url).href,
      compatibility: {
        date: "2026-05-14",
        flags: ["nodejs_compat"],
      },
      crons: stack.stage === "production" ? ["* * * * *"] : undefined,
      env: {
        GITHUB_NOTIFICATIONS_TOKEN: Config.redacted("NOTIFICATIONS_GITHUB_TOKEN"),
        GITHUB_REPO_TOKEN: Config.redacted("NOTIFICATIONS_REPO_TOKEN"),
        MARK_DONE: stack.stage === "production",
        MAX_PAGES: 2,
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

    yield* worker.bind("NotificationsKV", {
      bindings: [
        {
          type: "kv_namespace",
          name: "NOTIFICATIONS_KV",
          namespaceId: notificationsKvNamespaceId,
        },
      ],
    });

    return {
      workerName: worker.workerName,
    };
  }),
);
