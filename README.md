# Cloudflare Workers

A repository to store my Cloudflare Workers.

The following workers are available:

- [**`assets`**](apps/assets): A worker to host my assets.
- [**`image`**](apps/image): A worker to generate Open Graph images.
- [**`models`**](apps/models): A worker with access to Cloudflare Workers AI models.
- [**`notifications`**](apps/notifications): A worker to clean up GitHub notification noise.

## Deployment

Each worker is an independent Alchemy stack. Pushes to `main` deploy the
`production` stage. Pull requests from this repository deploy an isolated
`pr-<number>` stage and destroy it automatically when the pull request closes.
The shared Alchemy state is stored in Cloudflare.

GitHub Actions requires these secrets in the `deploy` environment:

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- `IMAGE_GITHUB_TOKEN`
- `MODELS_HMAC_SECRET`
- `NOTIFICATIONS_GITHUB_TOKEN` and `NOTIFICATIONS_REPO_TOKEN`

The Cloudflare credentials are managed by [`stacks/github.ts`](stacks/github.ts).
Bootstrap or rotate them locally with a dedicated, privileged Alchemy profile:

```sh
pnpm bootstrap:github
```

The script works from fish and uses `stacks/github.ts` to discover that the
admin profile needs both Cloudflare and GitHub credentials before running the
bootstrap deployment. When prompted for the Cloudflare authentication method,
choose **API Token or API Key**, not OAuth. Use either a Global API Key with its
email address, or a short-lived API token scoped to this account with **Workers
Scripts Write**, **Secrets Store Write**, and both User and Account **API Tokens
Write** permissions. The script deletes the privileged local `admin` profile
after a successful bootstrap. Give that bootstrap token a short expiration (and
revoke it in Cloudflare after use). The worker-specific secrets remain manually
managed GitHub Actions environment secrets.
