import type { AuditEntry, Env, GitHubNotification, GitHubSubject, PollState } from "./types";

export const GITHUB_API = "https://api.github.com";
export const STATE_KEY = "github:notifications:state";
const AUDIT_PREFIX = "github:notifications:audit:";
const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const POLL_INTERVAL_BUFFER_MS = 5_000;
const DEFAULT_MAX_PAGES = 2;
const PER_PAGE = 50;

function getMaxPages(env: Env) {
  const value = Number(env.MAX_PAGES ?? DEFAULT_MAX_PAGES);

  if (!Number.isSafeInteger(value) || value < 1) {
    return DEFAULT_MAX_PAGES;
  }

  return Math.min(value, 10);
}

export async function getState(env: Env): Promise<PollState> {
  return (await env.NOTIFICATIONS_KV.get<PollState>(STATE_KEY, "json")) ?? {};
}

export async function setState(env: Env, state: PollState) {
  await env.NOTIFICATIONS_KV.put(STATE_KEY, JSON.stringify(state));
}

export function updatePollStateFromResponse(previous: PollState, response: Response): PollState {
  const pollIntervalSeconds = Number(
    response.headers.get("x-poll-interval") ?? DEFAULT_POLL_INTERVAL_SECONDS,
  );
  const safePollIntervalSeconds =
    Number.isFinite(pollIntervalSeconds) && pollIntervalSeconds > 0
      ? pollIntervalSeconds
      : DEFAULT_POLL_INTERVAL_SECONDS;
  const lastModified = response.headers.get("last-modified") ?? previous.lastModified;

  return {
    lastModified,
    nextPollAt: Date.now() + safePollIntervalSeconds * 1000 + POLL_INTERVAL_BUFFER_MS,
  };
}

export function createGitHubHeaders(env: Env, state?: PollState): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "user-agent": "luxass-notifications-worker",
    "x-github-api-version": "2022-11-28",
  };

  if (state?.lastModified) {
    headers["if-modified-since"] = state.lastModified;
  }

  return headers;
}

export async function listNotifications(env: Env, state: PollState) {
  const notifications: GitHubNotification[] = [];
  let response: Response | undefined;

  for (let page = 1; page <= getMaxPages(env); page += 1) {
    const url = new URL("/notifications", GITHUB_API);
    url.searchParams.set("all", "false");
    url.searchParams.set("participating", "false");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    response = await fetch(url, {
      headers: createGitHubHeaders(env, page === 1 ? state : undefined),
    });

    if (response.status === 304) {
      return { status: "not-modified" as const, response, notifications };
    }

    if (!response.ok) {
      throw new Error(`GitHub notifications request failed with ${response.status}`);
    }

    const pageNotifications = (await response.json()) as GitHubNotification[];
    notifications.push(...pageNotifications);

    if (pageNotifications.length < PER_PAGE) {
      break;
    }
  }

  if (!response) {
    throw new Error("No GitHub notifications request was made");
  }

  return { status: "ok" as const, response, notifications };
}

export async function fetchSubject(env: Env, notification: GitHubNotification) {
  if (!notification.subject.url) {
    return undefined;
  }

  const response = await fetch(notification.subject.url, {
    headers: createGitHubHeaders(env),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub subject request for notification ${notification.id} failed with ${response.status}`,
    );
  }

  return (await response.json()) as GitHubSubject;
}

export async function markDone(env: Env, notification: GitHubNotification) {
  const response = await fetch(`${GITHUB_API}/notifications/threads/${notification.id}`, {
    method: "DELETE",
    headers: createGitHubHeaders(env),
  });

  if (!response.ok) {
    throw new Error(`GitHub mark-done request for ${notification.id} failed with ${response.status}`);
  }
}

export async function writeAudit(
  env: Env,
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
