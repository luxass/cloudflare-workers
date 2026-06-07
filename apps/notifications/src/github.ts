export interface PollState {
  lastModified?: string;
  nextPollAt?: number;
}

export interface GitHubNotification {
  id: string;
  last_read_at?: string | null;
  reason: string;
  updated_at: string;
  repository: {
    full_name: string;
  };
  subject: {
    title: string;
    type: string;
    url: string | null;
  };
}

export interface GitHubSubject {
  html_url?: string;
  merged?: boolean;
  number?: number;
  requested_reviewers?: Array<{
    login?: string;
    type?: string;
  }>;
  requested_teams?: Array<{
    name?: string;
    slug?: string;
  }>;
  state?: string;
  app?: {
    name?: string;
    slug?: string;
  } | null;
  actor?: {
    login?: string;
    type?: string;
  } | null;
  author?: {
    login?: string;
    type?: string;
  } | null;
  triggering_actor?: {
    login?: string;
    type?: string;
  } | null;
  user?: {
    login?: string;
    type?: string;
  } | null;
}

interface GitHubWorkflowRun {
  id: number;
  html_url?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  updated_at?: string;
}

interface GitHubPendingDeployment {
  environment?: {
    id?: number;
    name?: string;
  };
  current_user_can_approve?: boolean;
  wait_timer?: number;
  wait_timer_started_at?: string | null;
}

export type GitHubPendingDeploymentWithRun = GitHubPendingDeployment & {
  run?: GitHubWorkflowRun;
};

const GITHUB_API = "https://api.github.com";
const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const POLL_INTERVAL_BUFFER_MS = 5_000;
const DEFAULT_MAX_PAGES = 5;
const GITHUB_FETCH_TIMEOUT_MS = 15_000;
const PER_PAGE = 50;

class GitHubRequestError extends Error {
  constructor(
    readonly request: {
      method: string;
      status: number;
      url: string;
      body: string;
      retryAfter?: string;
      rateLimitRemaining?: string;
    },
  ) {
    const rateLimit = request.retryAfter
      ? `; retry after ${request.retryAfter}s`
      : request.rateLimitRemaining === "0"
        ? "; rate limit exhausted"
        : "";

    super(
      `GitHub ${request.method} ${request.url} failed with ${request.status}${rateLimit}${
        request.body ? `: ${request.body}` : ""
      }`,
    );
  }
}

async function githubFetch({
  body,
  env,
  headers,
  method = "GET",
  url,
}: {
  body?: BodyInit;
  env: CloudflareBindings;
  headers?: Record<string, string>;
  method?: string;
  url: string | URL;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      body,
      method,
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        ...headers,
        "user-agent":
          "notification cleaner (https://github.com/luxass/cloudflare-workers/tree/main/apps/notifications)",
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`GitHub ${method} ${url} timed out after ${GITHUB_FETCH_TIMEOUT_MS}ms`, {
        cause: err,
      });
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok && response.status !== 304) {
    throw new GitHubRequestError({
      body: await response.text().catch(() => ""),
      method,
      rateLimitRemaining: response.headers.get("x-ratelimit-remaining") ?? undefined,
      retryAfter: response.headers.get("retry-after") ?? undefined,
      status: response.status,
      url: String(url),
    });
  }

  return response;
}

export function updatePollStateFromResponse(previous: PollState, response: Response): PollState {
  const pollIntervalSeconds = Number(
    response.headers.get("x-poll-interval") ?? DEFAULT_POLL_INTERVAL_SECONDS,
  );
  const safePollIntervalSeconds =
    Number.isFinite(pollIntervalSeconds) && pollIntervalSeconds > 0
      ? pollIntervalSeconds
      : DEFAULT_POLL_INTERVAL_SECONDS;

  return {
    lastModified: response.headers.get("last-modified") ?? previous.lastModified,
    nextPollAt: Date.now() + safePollIntervalSeconds * 1000 + POLL_INTERVAL_BUFFER_MS,
  };
}

export async function listNotificationThreads(env: CloudflareBindings, state: PollState) {
  const maxPagesValue = env.MAX_PAGES ?? DEFAULT_MAX_PAGES;
  const maxPages =
    Number.isSafeInteger(maxPagesValue) && maxPagesValue > 0
      ? Math.min(maxPagesValue, 10)
      : DEFAULT_MAX_PAGES;

  const notifications: GitHubNotification[] = [];
  let response: Response | undefined;
  let hitPageLimit = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("/notifications", GITHUB_API);
    url.searchParams.set("all", "true");
    url.searchParams.set("participating", "false");
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    response = await githubFetch({
      env,
      headers:
        page === 1 && state.lastModified ? { "if-modified-since": state.lastModified } : undefined,
      url,
    });

    if (response.status === 304) {
      return { status: "not-modified" as const, response, notifications };
    }

    const pageNotifications: GitHubNotification[] = await response.json();
    notifications.push(...pageNotifications);

    if (pageNotifications.length < PER_PAGE) {
      break;
    }

    hitPageLimit = page === maxPages;
  }

  if (!response) {
    throw new Error("No GitHub notifications request was made");
  }

  return { status: "ok" as const, response, notifications, hitPageLimit };
}

export async function readNotificationSubject(
  env: CloudflareBindings,
  notification: GitHubNotification,
): Promise<GitHubSubject | undefined> {
  if (!notification.subject.url) {
    return undefined;
  }

  const response = await githubFetch({
    env,
    url: notification.subject.url,
  });

  return await response.json();
}

export async function markNotificationThreadDone(
  env: CloudflareBindings,
  notification: GitHubNotification,
) {
  await githubFetch({
    env,
    method: "DELETE",
    url: `${GITHUB_API}/notifications/threads/${notification.id}`,
  });
}

export async function listPendingDeploymentsForWaitingRuns(
  env: CloudflareBindings,
  notification: GitHubNotification,
) {
  const repository = parseRepositoryName(notification.repository.full_name);
  if (!repository) {
    return [];
  }

  const runs = await listRecentWorkflowRuns(env, repository);
  const pendingDeployments: GitHubPendingDeploymentWithRun[] = [];

  // Only waiting workflow runs can have pending deployments. Avoid one
  // pending-deployments request per completed/in-progress run.
  for (const run of runs.filter((run) => run.status === "waiting")) {
    const deployments = await listRunPendingDeployments(env, repository, run);
    for (const deployment of deployments) {
      pendingDeployments.push({ ...deployment, run });
    }
  }

  return pendingDeployments;
}

function parseRepositoryName(fullName: string) {
  const [owner, repo] = fullName.split("/");
  return owner && repo ? { owner, repo } : undefined;
}

async function listRecentWorkflowRuns(
  env: CloudflareBindings,
  repository: { owner: string; repo: string },
) {
  const url = new URL(`${GITHUB_API}/repos/${repository.owner}/${repository.repo}/actions/runs`);
  url.searchParams.set("per_page", "10");

  const response = await githubFetch({ env, url });
  const runs: { workflow_runs?: GitHubWorkflowRun[] } = await response.json();

  return runs.workflow_runs ?? [];
}

async function listRunPendingDeployments(
  env: CloudflareBindings,
  repository: { owner: string; repo: string },
  run: GitHubWorkflowRun,
): Promise<GitHubPendingDeployment[]> {
  const response = await githubFetch({
    env,
    url: `${GITHUB_API}/repos/${repository.owner}/${repository.repo}/actions/runs/${run.id}/pending_deployments`,
  });

  return await response.json();
}
