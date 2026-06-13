import { createLogger, log as eventLog } from "evlog";
import { initWorkersLogger } from "evlog/workers";

import {
  type GitHubPendingDeploymentWithRun,
  type GitHubSubject,
  type PollState,
  GitHubRequestError,
  listNotificationThreads,
  listPendingDeploymentsForWaitingRuns,
  markNotificationThreadDone,
  readNotificationSubject,
  updatePollStateFromResponse,
} from "./github";
import { classifyNotification } from "./policy";
import { mapConcurrent } from "./utils";

initWorkersLogger({
  env: { service: "notifications" },
});

const STATE_KEY = "github:notifications:state";
const NOTIFICATION_CONCURRENCY = 3;

export default {
  async scheduled(_event, env) {
    const log = createLogger({
      operation: "github_notifications_poll",
    });
    const startedAt = Date.now();
    const markDoneNotifications = String(env.MARK_DONE) === "true";

    const state = (await env.NOTIFICATIONS_KV.get<PollState>(STATE_KEY, "json")) ?? {};

    // GitHub tells notification clients how often to poll. Respect that even
    // though the Worker cron runs every minute.
    if (state.nextPollAt && Date.now() < state.nextPollAt) {
      return;
    }

    try {
      const result = await listNotificationThreads(env, state);
      const nextState = updatePollStateFromResponse(state, result.response);
      await env.NOTIFICATIONS_KV.put(
        STATE_KEY,
        JSON.stringify({
          ...nextState,
          // When the page limit is hit, keep the old validator so the next poll
          // continues from a full notifications response instead of accepting 304.
          lastModified: result.hitPageLimit ? state.lastModified : nextState.lastModified,
        }),
      );

      log.set({
        poll: {
          hitPageLimit: result.hitPageLimit,
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
        log.emit({
          message: "GitHub notifications not modified",
          outcome: "not_modified",
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const stats = {
        counts: {
          failed: 0,
          kept: 0,
          markedDone: 0,
        },
        decisionReasons: {} as Record<string, number>,
        notificationReasons: {} as Record<string, number>,
        subjectAuthors: {} as Record<string, number>,
        subjectTypes: {} as Record<string, number>,
        unknownIdentities: {
          reasons: {} as Record<string, number>,
          subjectTypes: {} as Record<string, number>,
        },
      };
      const subjects = new Map<string, Promise<GitHubSubject | undefined>>();
      const pendingDeployments = new Map<string, Promise<GitHubPendingDeploymentWithRun[]>>();

      await mapConcurrent(result.notifications, NOTIFICATION_CONCURRENCY, async (notification) => {
        const notificationStartedAt = Date.now();
        stats.notificationReasons[notification.reason] =
          (stats.notificationReasons[notification.reason] ?? 0) + 1;
        stats.subjectTypes[notification.subject.type] =
          (stats.subjectTypes[notification.subject.type] ?? 0) + 1;

        const github = {
          notificationId: notification.id,
          notificationReason: notification.reason,
          repository: notification.repository.full_name,
          subjectTitle: notification.subject.title,
          subjectType: notification.subject.type,
        };

        try {
          const classification = await classifyNotification(notification, {
            listPendingDeployments: async (notification) => {
              // WorkflowRun approval notifications do not include a subject URL,
              // so pending deployments are the only reliable freshness signal.
              let request = pendingDeployments.get(notification.repository.full_name);
              if (!request) {
                request = listPendingDeploymentsForWaitingRuns(env, notification);
                pendingDeployments.set(notification.repository.full_name, request);
              }

              return await request;
            },
            now: new Date(startedAt),
            readSubject: async (notification) => {
              const url = notification.subject.url;
              if (!url) {
                return undefined;
              }

              // Notifications can point at the same subject; keep one in-flight
              // request per URL for the whole poll.
              let request = subjects.get(url);
              if (!request) {
                request = readNotificationSubject(env, notification).catch((err) => {
                  if (err instanceof GitHubRequestError && (err.request.status === 404 || err.request.status === 403)) {
                    eventLog.warn({
                      operation: "github_notification_subject_fetch",
                      message: "GitHub notification subject not accessible",
                      status: err.request.status,
                      private: notification.repository.private,
                      url,
                      repository: notification.repository.full_name,
                    });
                    return undefined;
                  }
                  throw err;
                });
                subjects.set(url, request);
              }

              return await request;
            },
          });

          const { subject, decision, pendingDeployments: deployments, subjectAuthor } = classification;

          stats.subjectAuthors[subjectAuthor] = (stats.subjectAuthors[subjectAuthor] ?? 0) + 1;
          if (subjectAuthor === "unknown") {
            stats.unknownIdentities.reasons[notification.reason] =
              (stats.unknownIdentities.reasons[notification.reason] ?? 0) + 1;
            stats.unknownIdentities.subjectTypes[notification.subject.type] =
              (stats.unknownIdentities.subjectTypes[notification.subject.type] ?? 0) + 1;
          }
          stats.decisionReasons[decision.reason] =
            (stats.decisionReasons[decision.reason] ?? 0) + 1;

          let action: "kept" | "marked-done" | "would-mark-done";
          if (decision.action === "keep") {
            action = "kept";
          } else if (markDoneNotifications) {
            await markNotificationThreadDone(env, notification);
            action = "marked-done";
          } else {
            action = "would-mark-done";
          }

          if (action === "kept") {
            stats.counts.kept += 1;
          } else {
            stats.counts.markedDone += 1;
          }

          const pendingDeploymentsLog = deployments
            ? {
                count: deployments.length,
                environments: deployments
                  .map((deployment) => deployment.environment?.name)
                  .filter(Boolean),
                runs: deployments.map((deployment) => deployment.run?.id).filter(Boolean),
              }
            : undefined;

          const markedDone =
            action === "kept"
              ? undefined
              : {
                  action,
                  id: notification.id,
                  reason: notification.reason,
                  repository: notification.repository.full_name,
                  subjectAuthor,
                  subjectType: notification.subject.type,
                  why: decision.reason,
                };

          eventLog.info({
            operation: "github_notification_processed",
            message: "GitHub notification processed",
            action,
            markedDone,
            decision,
            github: {
              ...github,
              subjectAuthor,
            },
            htmlUrl: subject?.html_url,
            pendingDeployments: pendingDeploymentsLog,
            durationMs: Date.now() - notificationStartedAt,
          });
        } catch (err) {
          stats.counts.failed += 1;
          const reason =
            err instanceof Error ? err.message : "Unknown notification processing error";

          eventLog.error({
            operation: "github_notification_processed",
            message: "GitHub notification processing failed",
            action: "failed",
            error: reason,
            github,
            durationMs: Date.now() - notificationStartedAt,
          });
        }
      });

      log.set({
        decisionReasons: stats.decisionReasons,
        notificationReasons: stats.notificationReasons,
        notifications: stats.counts,
        subjectAuthors: stats.subjectAuthors,
        subjectTypes: stats.subjectTypes,
        unknownIdentities: stats.unknownIdentities,
      });
      log.emit({
        message: "GitHub notifications poll completed",
        markDone: markDoneNotifications,
        outcome: stats.counts.failed > 0 ? "partial_failure" : "success",
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
  },
} satisfies ExportedHandler<CloudflareBindings>;
