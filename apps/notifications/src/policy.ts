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
const CLOSEABLE_SUBJECT_TYPES = new Set(["PullRequest", "Issue"]);
const SUBJECT_TYPE_LABEL: Record<string, string> = {
  PullRequest: "pull request",
  Issue: "issue",
};
const STALE_APPROVAL_REQUEST_MS = 24 * 60 * 60 * 1000;

function keep(reason: string): NotificationDecision {
  return { action: "keep", reason };
}

function markDone(reason: string): NotificationDecision {
  return { action: "mark-done", reason };
}

function extractIdentity(subject: GitHubSubject | undefined): string | undefined {
  const author =
    subject?.user?.login ??
    subject?.author?.login ??
    subject?.actor?.login ??
    subject?.triggering_actor?.login;
  const app = subject?.app?.slug ?? subject?.app?.name;
  const raw = author?.endsWith("[bot]") ? author.slice(0, -5) : (author ?? app);
  return raw || undefined;
}

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
      decision: markDone("approval request is stale"),
    };
  }

  const pendingDeployments = options.listPendingDeployments
    ? await options.listPendingDeployments(notification)
    : [];

  return {
    decision:
      pendingDeployments.length === 0
        ? markDone("approval request has no pending deployments")
        : keep("approval request still has pending deployments"),
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
  // 1. Workflow failure notifications — no subject needed
  if (
    notification.reason === "ci_activity" &&
    (notification.subject.type === "CheckSuite" || notification.subject.type === "WorkflowRun") &&
    /run failed (at startup )?for .+ branch/i.test(notification.subject.title)
  ) {
    return markDone("workflow failure ci_activity is auto-done");
  }

  // 2. Subscribed release notifications — no subject needed
  if (notification.subject.type === "Release" && notification.reason === "subscribed") {
    return markDone("release subscribed notification is auto-done");
  }

  // 3. Closed/merged subjects — any notification about a finished PR or Issue is stale.
  //    Runs before NEVER_AUTO_DONE so a closed subject is always removed from the inbox.
  if (
    CLOSEABLE_SUBJECT_TYPES.has(notification.subject.type) &&
    (subject?.merged || subject?.state === "closed")
  ) {
    const label = SUBJECT_TYPE_LABEL[notification.subject.type] ?? notification.subject.type.toLowerCase();
    return markDone(`${label} ${notification.reason} notification is closed`);
  }

  const identity = extractIdentity(subject);

  // 4. Identities that should never be auto-done
  if (identity && NEVER_AUTO_DONE_IDENTITIES.has(identity)) {
    return keep(`subject identity ${identity} is never auto-done`);
  }

  // 5. Identities that are always auto-done (bots/apps that generate noise)
  if (identity && ALWAYS_AUTO_DONE_IDENTITIES.has(identity)) {
    return markDone(`subject identity ${identity} is always auto-done`);
  }

  // 6. Subject type not supported or URL missing — cannot inspect further
  if (!notification.subject.url || !SUPPORTED_SUBJECT_TYPES.has(notification.subject.type)) {
    return keep(`subject type ${notification.subject.type} is not supported`);
  }

  // 7. Review requests — check whether the reviewer list is still active
  if (notification.reason === "review_requested" && notification.subject.type === "PullRequest") {
    if (!subject) {
      return keep("pull request review request could not be checked");
    }

    if (
      (subject?.requested_reviewers?.length ?? 0) === 0 &&
      (subject?.requested_teams?.length ?? 0) === 0
    ) {
      return markDone("pull request review request is no longer pending");
    }

    return keep("pull request review request is still pending");
  }

  // 8. Protected reasons represent human-relevant interactions
  if (PROTECTED_REASONS.has(notification.reason)) {
    return keep(`notification reason ${notification.reason} is protected`);
  }

  return keep(identity ? `subject identity ${identity} is kept` : "subject has no identity");
}
