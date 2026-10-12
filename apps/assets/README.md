# assets

A simple cloudflare worker that proxies requests to my assets stored on GitHub.

## Usage

To use this worker, simply make a request to `https://assets.luxass.dev/` followed by the path to the asset you want to access.

> [!NOTE]
> Some paths are pointing to non-existent assets, e.g. `/ping`, `/view-source`, `/api/fonts`.

```bash
curl https://assets.luxass.dev/ping
```

## Local development

Run these commands from the repository root:

```sh
pnpm dev:assets
pnpm build:assets
pnpm --filter assets typecheck
pnpm --filter assets test
```

In the Turbo terminal UI, select `assets:dev` and press `i` to send input to Vite.
Then press `b`, `e`, `t`, or `h`, followed by Enter.
Press `Ctrl+z` to return control to Turbo.
The `t` shortcut starts a tunnel. Do not use it unless you intend to expose the local server.
Stream output does not forward keyboard input. Use `--ui=stream` when you only need logs.

This Worker uses Vite with the Cloudflare plugin beta.
`cloudflare.config.ts` defines the Worker and its bindings.
`vite.config.ts` defines the build.
Build files go in `.cloudflare/output/`.
`cf workers types` generates `.cloudflare/types/index.d.ts`.

## Deployment review

Do not deploy this migration before reviewing its custom domains.
The current configuration API accepts domain names but cannot preserve the old
`enabled` and `previews_enabled` flags.
Production and preview builds select separate domain lists, but this does not
replace those flags. A production deployment can remove existing preview domains.

The `ENVIRONMENT` binding is `production` by default and `preview` for preview builds.
Update the Workers Builds commands before enabling deployment.
Production uses `cf deploy`, and preview branches use `cf previews deploy`.
