/**
 * Environment variables read by the verify tests. Vitest exposes process.env as import.meta.env.
 */
interface ImportMetaEnv {
  /** Deployed Worker to test, e.g. https://image.luxass.dev */
  readonly VERIFY_BASE_URL?: string;
  /** Cloudflare Access service token ID, needed for *.previews.* hostnames. */
  readonly CF_ACCESS_CLIENT_ID?: string;
  /** Cloudflare Access service token secret, needed for *.previews.* hostnames. */
  readonly CF_ACCESS_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
