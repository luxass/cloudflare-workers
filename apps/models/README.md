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

Alchemy reads this credential from `MODELS_HMAC_SECRET` and deploys it to the
Worker as the `HMAC_SECRET` secret binding.

Every request to `POST /api/pr-metadata` must send:

```txt
X-Timestamp: <unix timestamp in milliseconds>
X-Signature: <hex hmac sha256 of "${timestamp}.${raw_json_body}">
```

## Request

| Field        | Required | Description                                                                                  |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `repository` | yes      | Must match `luxass/<repo>`.                                                                  |
| `diff`       | yes      | The changes to describe, at most 100,000 characters. Treated as untrusted data.              |
| `context`    | no       | Repository instructions, at most 4,000 characters. Appended to the built-in prompt.          |
| `model`      | no       | A Workers AI model from `src/pr-metadata-models.ts`. Defaults to `DEFAULT_PR_METADATA_MODEL`. |

Unknown fields are rejected. Callers cannot replace the built-in prompt in
`src/pr-metadata-prompt.ts`; they can only extend it with `context`.

```sh
curl -X POST http://localhost:8787/api/pr-metadata \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: $SIGNATURE" \
  -H "content-type: application/json" \
  -d '{
    "repository": "luxass/widgets",
    "context": "Prefer package names as the scope.",
    "diff": "diff --git a/src/api.ts b/src/api.ts\n+export async function createWidget() {}"
  }'
```

## Response

`200` returns `{ "type", "scope", "message", "body" }`. The Worker validates the model
output before it returns it:

- `type` is `docs`, `feat`, `fix`, or `chore`.
- `scope` is a single name or an empty string. Generic or unusable scopes become empty.
- `message` is one line of at most 72 characters.
- `body` is Markdown of at most 6,000 characters.
- Outside inline code, `message` and `body` contain no links, HTML, images, or `@` mentions.
  They never contain code fences or the `[incomplete]` release-blocking marker.

`502` means that no attempt produced valid metadata. Callers must treat it as an
incomplete result.

## Local helper

Use [sign-request.sh](./sign-request.sh) to build and sign requests locally:

```sh
HMAC_SECRET=your-local-secret ./sign-request.sh
```

By default it sends a sample `luxass/github-schema` diff with no context and the
default model.

Override any field when needed:

```sh
HMAC_SECRET=your-local-secret ./sign-request.sh \
  --repo luxass/github-schema \
  --context "Prefer GraphQL type names as scope when clear." \
  --model @cf/openai/gpt-oss-120b \
  --diff "$(git diff github-schema.graphql)"
```
