# Models Worker

A Cloudflare Worker for generating pull request metadata through the AI SDK and `workers-ai-provider`.

## Routes

- `GET /ping`
- `GET /view-source`
- `POST /api/pr-metadata`

## Auth

Set the Worker secret used to protect the endpoint:

```sh
wrangler secret put HMAC_SECRET
```

Every request to `POST /api/pr-metadata` must send:

```txt
X-Timestamp: <unix timestamp in milliseconds>
X-Signature: <hex hmac sha256 of "${timestamp}.${raw_json_body}">
```

## Request example

Generate PR metadata from a diff:

```sh
curl -X POST http://localhost:8787/api/pr-metadata \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: $SIGNATURE" \
  -H "content-type: application/json" \
  -d '{
    "repository": "acme/widgets",
    "context": "This repo is a TypeScript monorepo. Prefer package-level scopes when clear.",
    "diff": "diff --git a/src/api.ts b/src/api.ts\n+export async function createWidget() {}"
  }'
```

## Local helper

Use [sign-request.sh](/Users/lucasnorgard/dev/cloudflare-workers/apps/models/sign-request.sh) to build and sign requests locally:

```sh
HMAC_SECRET=your-local-secret ./sign-request.sh
```

By default it is hardcoded for `luxass/github-schema` and will use:

- repository: `luxass/github-schema`
- GraphQL-specific context
- diff from `/Users/lucasnorgard/dev/github-schema/github-schema.diff` if present, otherwise `git diff` in `/Users/lucasnorgard/dev/github-schema`

Override any field when needed:

```sh
HMAC_SECRET=your-local-secret ./sign-request.sh \
  --repo luxass/github-schema \
  --context "Prefer GraphQL type names as scope when clear." \
  --diff "$(git diff github-schema.graphql)"
```
