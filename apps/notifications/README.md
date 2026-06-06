# notifications

A scheduled Worker that polls GitHub notifications and marks safe dependency-bot noise as done.

The Worker uses GitHub notification polling correctly:

- stores `Last-Modified` in KV
- sends `If-Modified-Since`
- stores `X-Poll-Interval` as `nextPollAt`
- exits early when Cloudflare cron wakes it before GitHub allows another poll

## Setup

Create the KV namespace and replace the placeholder IDs in `wrangler.jsonc`:

```sh
pnpm --filter notifications wrangler kv namespace create NOTIFICATIONS_KV
```

Create a classic GitHub token with the `notifications` scope, then store it:

```sh
pnpm --filter notifications wrangler secret put GITHUB_TOKEN
```

## Policy

Auto-done currently requires all of this:

- notification `reason` is `subscribed`
- subject is a pull request or issue
- fetched subject author is `renovate[bot]` or `dependabot[bot]`

These reasons are always kept: `mention`, `team_mention`, `review_requested`, `assign`, `author`, `comment`, `manual`, `security_alert`, `invitation`, `state_change`.
