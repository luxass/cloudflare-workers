/**
 * Shared helpers for the deployed-Worker verify tests in scripts/verify/*.verify.ts.
 */

const WAIT_FOR_WORKER_TIMEOUT_MS = 90_000;
const WAIT_FOR_WORKER_INTERVAL_MS = 5_000;
const CLOUDFLARE_ACCESS_LOGIN_HOST = ".cloudflareaccess.com";

/**
 * The deployed Worker URL to test, e.g. https://my-branch.previews.image.luxass.dev
 */
export function getVerifyBaseUrl(): string {
  const baseUrl = import.meta.env.VERIFY_BASE_URL;
  if (!baseUrl) {
    throw new Error("VERIFY_BASE_URL is not set, e.g. VERIFY_BASE_URL=https://image.luxass.dev");
  }

  return baseUrl.replace(/\/+$/, "");
}

/**
 * Preview hostnames are protected by Cloudflare Access. A service token lets CI through.
 */
function getCloudflareAccessHeaders(): Record<string, string> {
  const clientId = import.meta.env.CF_ACCESS_CLIENT_ID;
  const clientSecret = import.meta.env.CF_ACCESS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {};
  }

  return {
    "cf-access-client-id": clientId,
    "cf-access-client-secret": clientSecret,
  };
}

/**
 * Fetches a path on the deployed Worker. Redirects are not followed, so tests can assert on them.
 */
export function fetchFromWorker(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${getVerifyBaseUrl()}${path}`, {
    redirect: "manual",
    ...init,
    headers: {
      "user-agent": "cloudflare-workers-verify",
      ...getCloudflareAccessHeaders(),
      ...init.headers,
    },
  });
}

class CloudflareAccessBlockedError extends Error {}

function isCloudflareAccessLoginRedirect(response: Response): boolean {
  const location = response.headers.get("location");
  if (!location) {
    return false;
  }

  return new URL(location, getVerifyBaseUrl()).hostname.endsWith(CLOUDFLARE_ACCESS_LOGIN_HOST);
}

/**
 * Polls GET /ping until the Worker answers with 418, because a fresh preview
 * alias can take a few seconds before it routes to the new version.
 */
export async function waitForWorker(): Promise<void> {
  const deadline = Date.now() + WAIT_FOR_WORKER_TIMEOUT_MS;
  let lastProblem = "no response";

  while (Date.now() < deadline) {
    try {
      const response = await fetchFromWorker("/ping");
      if (response.status === 418) {
        return;
      }

      if (isCloudflareAccessLoginRedirect(response)) {
        throw new CloudflareAccessBlockedError(
          `${getVerifyBaseUrl()} is behind Cloudflare Access. ` +
            "Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to a service token allowed by the Access application.",
        );
      }

      lastProblem = `GET /ping returned ${response.status}`;
    } catch (error) {
      if (error instanceof CloudflareAccessBlockedError) {
        throw error;
      }
      lastProblem = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_WORKER_INTERVAL_MS));
  }

  throw new Error(
    `Worker at ${getVerifyBaseUrl()} was not ready after ${WAIT_FOR_WORKER_TIMEOUT_MS}ms: ${lastProblem}`,
  );
}
