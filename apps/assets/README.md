# assets

A simple cloudflare worker that proxies requests to my assets stored on GitHub.

## Usage

To use this worker, simply make a request to `https://assets.luxass.dev/` followed by the path to the asset you want to access.

> [!NOTE]
> Some paths are pointing to non-existent assets, e.g. `/ping`, `/view-source`, `/api/fonts`.

```bash
curl https://assets.luxass.dev/ping
```
