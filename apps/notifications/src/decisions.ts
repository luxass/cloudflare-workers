import { markNotificationThreadDone } from "./github";
import type { GitHubNotification } from "./github";
import type { NotificationDecision } from "./policy";

export type NotificationAction = "would-mark-done" | "marked-done" | "kept" | "failed";

const SUBJECT_TYPES_WITH_USEFUL_DETAILS = new Set(["PullRequest", "Issue"]);
const REASONS_WITH_USEFUL_PR_DETAILS = new Set(["author", "review_requested"]);
const PROTECTED_WITHOUT_SUBJECT = new Set([
  "assign",
  "comment",
  "invitation",
  "manual",
  "mention",
  "security_alert",
  "state_change",
  "team_mention",
]);

export function isApprovalRequestWithoutSubject(notification: GitHubNotification) {
  return (
    notification.reason === "approval_requested" &&
    notification.subject.type === "WorkflowRun" &&
    !notification.subject.url
  );
}

export function shouldFetchSubject(notification: GitHubNotification) {
  if (!notification.subject.url) {
    return false;
  }

  if (!SUBJECT_TYPES_WITH_USEFUL_DETAILS.has(notification.subject.type)) {
    return false;
  }

  if (PROTECTED_WITHOUT_SUBJECT.has(notification.reason)) {
    return false;
  }

  if (notification.subject.type === "PullRequest") {
    return true;
  }

  // Issue subjects are only fetched when identity may affect the decision. PR-only
  // reasons cannot benefit from fetching an Issue subject.
  return !REASONS_WITH_USEFUL_PR_DETAILS.has(notification.reason);
}

export async function applyDecision(
  env: CloudflareBindings,
  notification: GitHubNotification,
  decision: NotificationDecision,
  markDoneNotifications: boolean,
): Promise<Exclude<NotificationAction, "failed">> {
  if (decision.action === "keep") {
    return "kept";
  }

  if (markDoneNotifications) {
    await markNotificationThreadDone(env, notification);
    return "marked-done";
  }

  return "would-mark-done";
}
