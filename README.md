# Cloudflare Workers

A repository to store my Cloudflare Workers.

The following workers are available:

- [**`assets`**](apps/assets): A worker to host my assets.
- [**`image`**](apps/image): A worker to generate Open Graph images.
- [**`models`**](apps/models): A worker with access to Cloudflare Workers AI models.

## Deployment

Each worker is deployed with Wrangler. Production deploys run
`wrangler deploy` (via `pnpm deploy:<worker>` or the Workers Builds GitHub
connection), and preview branches run `wrangler preview`, which deploys an
isolated Preview using the `previews` block in each worker's
[`wrangler.jsonc`](apps/image/wrangler.jsonc). Preview URLs are served from
`<preview-name>.previews.<worker>.luxass.dev`, which are preview-only domains
(`enabled: false`, `previews_enabled: true` in the wrangler config).

