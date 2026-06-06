import type { GitHubNotification, GitHubSubject } from "./types";

const SAFE_SUBJECT_TYPES = new Set(["PullRequest", "Issue"]);
const ALWAYS_AUTO_DONE_AUTHORS = new Set(["renovate[bot]", "dependabot[bot]"]);
const SUBSCRIBED_AUTO_DONE_AUTHORS = new Set(["coderabbitai[bot]", "vercel[bot]"]);
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

export function classify(notification: GitHubNotification, subject?: GitHubSubject) {
  if (!notification.subject.url || !SAFE_SUBJECT_TYPES.has(notification.subject.type)) {
    return {
      action: "keep" as const,
      reason: `subject type ${notification.subject.type} is not supported`,
    };
  }

  const author = subject?.user?.login;

  if (author && ALWAYS_AUTO_DONE_AUTHORS.has(author)) {
    return {
      action: "mark-done" as const,
      reason: `subject author ${author} is always auto-done`,
    };
  }

  if (NEVER_AUTO_DONE_REASONS.has(notification.reason)) {
    return {
      action: "keep" as const,
      reason: `notification reason ${notification.reason} is protected`,
    };
  }

  if (notification.reason === "subscribed" && author && SUBSCRIBED_AUTO_DONE_AUTHORS.has(author)) {
    return {
      action: "mark-done" as const,
      reason: `subject author ${author} is a subscribed bot notification`,
    };
  }

  return {
    action: "keep" as const,
    reason: author ? `subject author ${author} is kept` : "subject has no author",
  };
}
