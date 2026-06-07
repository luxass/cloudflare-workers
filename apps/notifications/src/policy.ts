import type { GitHubNotification, GitHubSubject } from "./github";

export type NotificationDecision = {
  action: "keep" | "mark-done";
  reason: string;
};

const SAFE_SUBJECT_TYPES = new Set(["PullRequest", "Issue"]);
const NEVER_AUTO_DONE_IDENTITIES = new Set([
  "huginn-watch",
  "luxass-shared-workflows",
  "luxass-homebrew",
]);
const ALWAYS_AUTO_DONE_IDENTITIES = new Set([
  "renovate",
  "dependabot",
  "coderabbitai",
  "vercel",
  "cloudflare-workers-and-pages",
  "github-actions",
]);
const NEVER_AUTO_DONE_REASONS = new Set([
  "assign",
  "author",
  "comment",
  "invitation",
  "manual",
  "mention",
  "review_requested",
  "security_alert",
  "state_change",
  "team_mention",
]);

export function classifyNotification(
  notification: GitHubNotification,
): NotificationDecision | undefined {
  if (
    notification.reason === "ci_activity" &&
    (notification.subject.type === "CheckSuite" || notification.subject.type === "WorkflowRun") &&
    /run failed (at startup )?for .+ branch/i.test(notification.subject.title)
  ) {
    return {
      action: "mark-done" as const,
      reason: "workflow failure ci_activity is auto-done",
    };
  }

  if (notification.subject.type === "Release" && notification.reason === "subscribed") {
    return {
      action: "mark-done" as const,
      reason: "release subscribed notification is auto-done",
    };
  }

  return undefined;
}

export function classify(
  notification: GitHubNotification,
  subject?: GitHubSubject,
): NotificationDecision {
  const author =
    subject?.user?.login ??
    subject?.author?.login ??
    subject?.actor?.login ??
    subject?.triggering_actor?.login;
  const app = subject?.app?.slug ?? subject?.app?.name;
  const identity = author?.endsWith("[bot]") ? author.slice(0, -5) : (author ?? app);

  if (
    (notification.reason === "author" || notification.reason === "review_requested") &&
    notification.subject.type === "PullRequest" &&
    (subject?.merged || subject?.state === "closed")
  ) {
    return {
      action: "mark-done" as const,
      reason: `pull request ${notification.reason} notification is closed`,
    };
  }

  if (identity && NEVER_AUTO_DONE_IDENTITIES.has(identity)) {
    return {
      action: "keep" as const,
      reason: `subject identity ${identity} is never auto-done`,
    };
  }

  if (identity && ALWAYS_AUTO_DONE_IDENTITIES.has(identity)) {
    return {
      action: "mark-done" as const,
      reason: `subject identity ${identity} is always auto-done`,
    };
  }

  const notificationDecision = classifyNotification(notification);
  if (notificationDecision) {
    return notificationDecision;
  }

  if (!notification.subject.url || !SAFE_SUBJECT_TYPES.has(notification.subject.type)) {
    return {
      action: "keep" as const,
      reason: `subject type ${notification.subject.type} is not supported`,
    };
  }

  if (notification.reason === "review_requested" && notification.subject.type === "PullRequest") {
    if (!subject) {
      return {
        action: "keep" as const,
        reason: "pull request review request could not be checked",
      };
    }

    if (
      (subject?.requested_reviewers?.length ?? 0) === 0 &&
      (subject?.requested_teams?.length ?? 0) === 0
    ) {
      return {
        action: "mark-done" as const,
        reason: "pull request review request is no longer pending",
      };
    }

    return {
      action: "keep" as const,
      reason: "pull request review request is still pending",
    };
  }

  if (NEVER_AUTO_DONE_REASONS.has(notification.reason)) {
    return {
      action: "keep" as const,
      reason: `notification reason ${notification.reason} is protected`,
    };
  }

  return {
    action: "keep" as const,
    reason: identity ? `subject identity ${identity} is kept` : "subject has no identity",
  };
}
