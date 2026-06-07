import type { GitHubNotification } from "./github";

export type NotificationAction = "would-mark-done" | "marked-done" | "kept" | "failed";

interface AuditEntry {
  action: NotificationAction;
  reason: string;
  notificationId: string;
  repository: string;
  subjectTitle: string;
  subjectType: string;
  notificationReason: string;
  subjectAuthor?: string;
  htmlUrl?: string;
  createdAt: string;
}

const AUDIT_PREFIX = "github:notifications:audit:";

export async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(callback));
  }
}

export async function writeAudit(
  env: CloudflareBindings,
  notification: GitHubNotification,
  entry: Omit<
    AuditEntry,
    | "notificationId"
    | "repository"
    | "subjectTitle"
    | "subjectType"
    | "notificationReason"
    | "createdAt"
  >,
) {
  const createdAt = new Date().toISOString();
  const auditEntry: AuditEntry = {
    ...entry,
    notificationId: notification.id,
    repository: notification.repository.full_name,
    subjectTitle: notification.subject.title,
    subjectType: notification.subject.type,
    notificationReason: notification.reason,
    createdAt,
  };

  await env.NOTIFICATIONS_KV.put(
    `${AUDIT_PREFIX}${createdAt}:${notification.id}`,
    JSON.stringify(auditEntry),
    { expirationTtl: 60 * 60 * 24 * 30 },
  );
}
