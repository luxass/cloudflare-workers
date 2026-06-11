import { mkdir, rm, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const outDir = "apps/notifications/fixtures/github-notifications";
const perPage = 50;
const includeReadNotifications =
  process.env.GITHUB_NOTIFICATIONS_INCLUDE_READ === "true" ||
  process.env.GITHUB_NOTIFICATION_INCLUDE_READ === "true";
const since = process.env.GITHUB_NOTIFICATIONS_SINCE;
const supportedSubjectTypes = new Set(["PullRequest", "Issue"]);

if (!token) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}

const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "user-agent": "github-notification-payload-dumper",
  "x-github-api-version": "2022-11-28",
};

async function githubJson(url) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GET ${url} failed with ${response.status}: ${body}`);
  }

  return await response.json();
}

function safeName(value) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

async function writeJson(filePath, payload) {
  await writeFile(filePath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${filePath}`);
}

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });
await mkdir(`${outDir}/subjects`, { recursive: true });

const allNotifications = [];
let skippedPrivateNotifications = 0;
let skippedReadNotifications = 0;
let skippedUnsupportedSubjects = 0;

for (let page = 1; ; page += 1) {
  const url = new URL("https://api.github.com/notifications");
  // GitHub REST `all=true` includes read backlog. If you enable it, pass a
  // recent GITHUB_NOTIFICATIONS_SINCE timestamp to avoid dumping old done items.
  url.searchParams.set("all", String(includeReadNotifications));
  url.searchParams.set("participating", "false");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  if (since) {
    url.searchParams.set("since", since);
  }

  const notifications = await githubJson(url);
  const currentPublicNotifications = notifications.filter((notification) => {
    if (!includeReadNotifications && notification.unread === false) {
      skippedReadNotifications += 1;
      return false;
    }

    const isPrivate = notification.repository?.private === true;
    if (isPrivate) {
      skippedPrivateNotifications += 1;
    }

    return !isPrivate;
  });

  allNotifications.push(...currentPublicNotifications);

  await writeJson(`${outDir}/notifications-page-${page}.json`, currentPublicNotifications);

  if (notifications.length < perPage) {
    break;
  }
}

await writeJson(`${outDir}/notifications.json`, allNotifications);

for (const notification of allNotifications) {
  if (!notification.subject?.url) {
    continue;
  }

  if (!supportedSubjectTypes.has(notification.subject.type)) {
    skippedUnsupportedSubjects += 1;
    continue;
  }

  try {
    const subject = await githubJson(notification.subject.url);
    const name = safeName(
      `${notification.id}-${notification.subject.type}-${notification.repository.full_name}`,
    );

    await writeJson(`${outDir}/subjects/${name}.json`, {
      notification: {
        id: notification.id,
        reason: notification.reason,
        repository: notification.repository.full_name,
        subject: notification.subject,
        updated_at: notification.updated_at,
      },
      subject,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed subject for notification ${notification.id}: ${message}`);
  }
}

console.log(
  `Saved ${allNotifications.length} public notifications to ${outDir} (${skippedReadNotifications} read notifications skipped, ${skippedPrivateNotifications} private notifications skipped, ${skippedUnsupportedSubjects} unsupported subjects skipped)`,
);
