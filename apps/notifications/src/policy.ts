import { shouldFetchSubject } from "./github";
import type { GitHubNotification, GitHubSubject } from "./types";

const BOT_AUTHORS = new Set(["renovate[bot]", "dependabot[bot]", "coderabbit[bot]"]);
const SAFE_AUTO_DONE_REASONS = new Set(["subscribed"]);
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
  if (NEVER_AUTO_DONE_REASONS.has(notification.reason)) {
    return {
      action: "keep" as const,
      reason: `notification reason ${notification.reason} is protected`,
    };
  }

  if (!SAFE_AUTO_DONE_REASONS.has(notification.reason)) {
    return {
      action: "keep" as const,
      reason: `notification reason ${notification.reason} is not auto-done`,
    };
  }

  if (!shouldFetchSubject(notification)) {
    return {
      action: "keep" as const,
      reason: `subject type ${notification.subject.type} is not supported`,
    };
  }

  const author = subject?.user?.login;

  if (!author || !BOT_AUTHORS.has(author)) {
    return {
      action: "keep" as const,
      reason: author ? `subject author ${author} is not a dependency bot` : "subject has no author",
    };
  }

  return {
    action: "mark-done" as const,
    reason: `subject author ${author} is a dependency bot`,
  };
}
