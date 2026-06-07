import { createLogger, log as eventLog } from "evlog";
import { initWorkersLogger } from "evlog/workers";

import { applyDecision, isApprovalRequestWithoutSubject, shouldFetchSubject } from "./decisions";
import {
  type GitHubPendingDeploymentWithRun,
  type GitHubSubject,
  type PollState,
  listNotificationThreads,
  listPendingDeploymentsForWaitingRuns,
  readNotificationSubject,
  updatePollStateFromResponse,
} from "./github";
import { classify, classifyNotification } from "./policy";
import { mapConcurrent, writeAudit } from "./utils";

initWorkersLogger({
  env: { service: "notifications" },
});

const STATE_KEY = "github:notifications:state";
const NOTIFICATION_CONCURRENCY = 3;
const STALE_APPROVAL_REQUEST_MS = 24 * 60 * 60 * 1000;

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
          let subject: GitHubSubject | undefined;
          let deployments: GitHubPendingDeploymentWithRun[] | undefined;
          // Start with rules that only need the notification payload. Subject
          // URLs cost an extra GitHub request and often add no useful signal.
          let decision = classifyNotification(notification);

          if (!decision && isApprovalRequestWithoutSubject(notification)) {
            const updatedAt = Date.parse(notification.updated_at);
            const stale =
              Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_APPROVAL_REQUEST_MS;

            if (stale) {
              decision = {
                action: "mark-done",
                reason: "approval request is stale",
              };
            } else {
              // WorkflowRun approval notifications do not include a subject URL,
              // so pending deployments are the only reliable freshness signal.
              let request = pendingDeployments.get(notification.repository.full_name);
              if (!request) {
                request = listPendingDeploymentsForWaitingRuns(env, notification);
                pendingDeployments.set(notification.repository.full_name, request);
              }

              deployments = await request;
              decision =
                deployments.length === 0
                  ? {
                      action: "mark-done",
                      reason: "approval request has no pending deployments",
                    }
                  : {
                      action: "keep",
                      reason: "approval request still has pending deployments",
                    };
            }
          }

          if (!decision && shouldFetchSubject(notification)) {
            const url = notification.subject.url;
            if (url) {
              // Notifications can point at the same subject; keep one in-flight
              // request per URL for the whole poll.
              let request = subjects.get(url);
              if (!request) {
                request = readNotificationSubject(env, notification);
                subjects.set(url, request);
              }

              subject = await request;
            }
          }

          decision ??= classify(notification, subject);

          const subjectAuthor =
            subject?.user?.login ??
            subject?.author?.login ??
            subject?.actor?.login ??
            subject?.triggering_actor?.login ??
            subject?.app?.slug ??
            subject?.app?.name ??
            "unknown";

          stats.subjectAuthors[subjectAuthor] = (stats.subjectAuthors[subjectAuthor] ?? 0) + 1;
          if (subjectAuthor === "unknown") {
            stats.unknownIdentities.reasons[notification.reason] =
              (stats.unknownIdentities.reasons[notification.reason] ?? 0) + 1;
            stats.unknownIdentities.subjectTypes[notification.subject.type] =
              (stats.unknownIdentities.subjectTypes[notification.subject.type] ?? 0) + 1;
          }
          stats.decisionReasons[decision.reason] =
            (stats.decisionReasons[decision.reason] ?? 0) + 1;

          const action = await applyDecision(env, notification, decision, markDoneNotifications);
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
            pendingDeployments: pendingDeploymentsLog,
            durationMs: Date.now() - notificationStartedAt,
          });

          await writeAudit(env, notification, {
            action,
            reason: decision.reason,
            subjectAuthor,
            htmlUrl: subject?.html_url,
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

          await writeAudit(env, notification, {
            action: "failed",
            reason,
          }).catch((auditErr) => {
            eventLog.error({
              operation: "github_notification_audit_failed",
              message: "GitHub notification failure audit write failed",
              error: auditErr instanceof Error ? auditErr.message : "Unknown audit write error",
              github,
            });
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
