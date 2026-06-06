import { createLogger } from "evlog";
import { initWorkersLogger } from "evlog/workers";

import {
  fetchSubject,
  getState,
  listNotifications,
  markDone,
  setState,
  updatePollStateFromResponse,
  writeAudit,
} from "./github";
import { classify } from "./policy";
import type { Env } from "./types";

initWorkersLogger({
  env: { service: "notifications" },
});

export default {
  scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const log = createLogger({
        operation: "github_notifications_poll",
      });
      const startedAt = Date.now();

      try {
        const state = await getState(env);

        if (state.nextPollAt && Date.now() < state.nextPollAt) {
          log.info("GitHub notifications poll skipped", {
            message: "GitHub notifications poll skipped",
            poll: {
              nextPollAt: new Date(state.nextPollAt).toISOString(),
            },
          });
          log.emit({
            message: "GitHub notifications poll skipped",
            outcome: "skipped",
            durationMs: Date.now() - startedAt,
          });
          return;
        }

        const result = await listNotifications(env, state);
        const nextState = updatePollStateFromResponse(state, result.response);
        await setState(env, nextState);

        log.set({
          poll: {
            status: result.status,
            nextPollAt: nextState.nextPollAt
              ? new Date(nextState.nextPollAt).toISOString()
              : undefined,
          },
          github: {
            notificationCount: result.notifications.length,
          },
        });

        if (result.status === "not-modified") {
          log.info("GitHub notifications not modified", {
            message: "GitHub notifications not modified",
          });
          log.emit({
            message: "GitHub notifications not modified",
            outcome: "not_modified",
            durationMs: Date.now() - startedAt,
          });
          return;
        }

        const counts = {
          failed: 0,
          kept: 0,
          markedDone: 0,
        };

        for (const notification of result.notifications) {
          try {
            const subject =
              notification.subject.url &&
              (notification.subject.type === "PullRequest" || notification.subject.type === "Issue")
                ? await fetchSubject(env, notification)
                : undefined;
            const decision = classify(notification, subject);

            if (decision.action === "keep") {
              counts.kept += 1;
              await writeAudit(env, notification, {
                action: "kept",
                reason: decision.reason,
                subjectAuthor: subject?.user?.login,
                htmlUrl: subject?.html_url,
              });
              continue;
            }

            await markDone(env, notification);
            counts.markedDone += 1;
            log.info("GitHub notification marked done", {
              message: "GitHub notification marked done",
              github: {
                notificationId: notification.id,
                notificationReason: notification.reason,
                repository: notification.repository.full_name,
                subjectAuthor: subject?.user?.login,
                subjectType: notification.subject.type,
              },
              reason: decision.reason,
            });
            await writeAudit(env, notification, {
              action: "marked-done",
              reason: decision.reason,
              subjectAuthor: subject?.user?.login,
              htmlUrl: subject?.html_url,
            });
          } catch (err) {
            counts.failed += 1;
            log.error(err instanceof Error ? err : "Unknown notification processing error", {
              message: "GitHub notification processing failed",
              github: {
                notificationId: notification.id,
                notificationReason: notification.reason,
                repository: notification.repository.full_name,
                subjectType: notification.subject.type,
              },
            });
            await writeAudit(env, notification, {
              action: "failed",
              reason: err instanceof Error ? err.message : "Unknown notification processing error",
            });
          }
        }

        log.set({
          notifications: counts,
        });
        log.emit({
          message: "GitHub notifications poll completed",
          outcome: counts.failed > 0 ? "partial_failure" : "success",
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        log.error(err instanceof Error ? err : "Unknown GitHub notifications poll error", {
          message: "GitHub notifications poll failed",
        });
        log.emit({
          message: "GitHub notifications poll failed",
          outcome: "failure",
          durationMs: Date.now() - startedAt,
        });
        throw err;
      }
    })());
  },
} satisfies ExportedHandler<Env>;
