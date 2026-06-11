import type { GitHubNotification, GitHubPendingDeploymentWithRun, GitHubSubject } from "./github";

export type NotificationDecision = {
  action: "keep" | "mark-done";
  reason: string;
};

export type NotificationClassification = {
  decision: NotificationDecision;
  pendingDeployments?: GitHubPendingDeploymentWithRun[];
  subject?: GitHubSubject;
  subjectAuthor: string;
};

export type ReadNotificationSubject = (
  notification: GitHubNotification,
) => Promise<GitHubSubject | undefined>;

export type ClassifyNotificationOptions = {
  listPendingDeployments?: (
    notification: GitHubNotification,
  ) => Promise<GitHubPendingDeploymentWithRun[]>;
  now?: Date;
  readSubject: ReadNotificationSubject;
};

const SUPPORTED_SUBJECT_TYPES = new Set(["PullRequest", "Issue"]);
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
const PROTECTED_REASONS = new Set([
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
const STALE_APPROVAL_REQUEST_MS = 24 * 60 * 60 * 1000;

export function shouldFetchSubject(notification: GitHubNotification) {
  return Boolean(
    notification.subject.url && SUPPORTED_SUBJECT_TYPES.has(notification.subject.type),
  );
}

export async function classifyNotification(
  notification: GitHubNotification,
  options: ClassifyNotificationOptions | ReadNotificationSubject,
): Promise<NotificationClassification> {
  const normalizedOptions =
    typeof options === "function" ? { readSubject: options } : options;
  const approvalDecision = await classifyApprovalRequest(notification, normalizedOptions);
  if (approvalDecision) {
    return {
      decision: approvalDecision.decision,
      pendingDeployments: approvalDecision.pendingDeployments,
      subjectAuthor: "unknown",
    };
  }

  const subject = shouldFetchSubject(notification)
    ? await normalizedOptions.readSubject(notification)
    : undefined;
  const decision = classify(notification, subject);
  const subjectAuthor = getSubjectAuthor(subject);

  return { decision, subject, subjectAuthor };
}

async function classifyApprovalRequest(
  notification: GitHubNotification,
  options: ClassifyNotificationOptions,
): Promise<Pick<NotificationClassification, "decision" | "pendingDeployments"> | undefined> {
  if (
    notification.reason !== "approval_requested" ||
    notification.subject.type !== "WorkflowRun" ||
    notification.subject.url
  ) {
    return undefined;
  }

  const updatedAt = Date.parse(notification.updated_at);
  const now = options.now ?? new Date();
  const stale = Number.isFinite(updatedAt) && now.getTime() - updatedAt > STALE_APPROVAL_REQUEST_MS;

  if (stale) {
    return {
      decision: {
        action: "mark-done",
        reason: "approval request is stale",
      },
    };
  }

  const pendingDeployments = options.listPendingDeployments
    ? await options.listPendingDeployments(notification)
    : [];

  return {
    decision:
      pendingDeployments.length === 0
        ? {
            action: "mark-done",
            reason: "approval request has no pending deployments",
          }
        : {
            action: "keep",
            reason: "approval request still has pending deployments",
          },
    pendingDeployments,
  };
}

export function getSubjectAuthor(subject: GitHubSubject | undefined) {
  return (
    subject?.user?.login ??
    subject?.author?.login ??
    subject?.actor?.login ??
    subject?.triggering_actor?.login ??
    subject?.app?.slug ??
    subject?.app?.name ??
    "unknown"
  );
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

  if (!notification.subject.url || !SUPPORTED_SUBJECT_TYPES.has(notification.subject.type)) {
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

  if (PROTECTED_REASONS.has(notification.reason)) {
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
