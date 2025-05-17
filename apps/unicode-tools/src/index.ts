import type { ApiError } from "@cf-workers/helpers";
import type { UnicodeVersion as UnicodeToolsUnicodeVersion } from "@luxass/unicode-tools";
import { createError, createPingPongRoute, createViewSourceRedirect } from "@cf-workers/helpers";
import { mapUnicodeVersion } from "@luxass/unicode-tools";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export interface HonoContext {
  Bindings: CloudflareBindings;
}

const app = new Hono<HonoContext>();

app.get("/view-source", createViewSourceRedirect("unicode-tools"));
app.get("/ping", createPingPongRoute());

type UnicodeVersion = Record<keyof UnicodeToolsUnicodeVersion, string>;

app.get("/api/unicode-versions", async (c) => {
  const response = await fetch("https://www.unicode.org/versions/enumeratedversions.html");
  if (!response.ok) {
    return createError(c, 500, "Failed to fetch Unicode versions");
  }

  const html = await response.text();

  // find any table that contains Unicode version information
  const versionPattern = /Unicode \d+\.\d+\.\d+/;
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/g)?.find((table) =>
    versionPattern.test(table),
  );

  if (!tableMatch) {
    return createError(c, 404, "Unicode versions table not found");
  }

  const versions: UnicodeVersion[] = [];

  // match any row that contains a cell
  const rows = tableMatch.match(/<tr>[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    // look for Unicode version pattern in the row
    const versionMatch = row.match(new RegExp(`<a[^>]+href="([^"]+)"[^>]*>\\s*(${versionPattern.source})\\s*</a>`));
    if (!versionMatch) continue;

    const documentationUrl = versionMatch[1];
    const version = versionMatch[2].replace("Unicode ", "");

    // look for a year pattern anywhere in the row
    const dateMatch = row.match(/<td[^>]*>(\d{4})<\/td>/);
    if (!dateMatch) continue;
    const ucdVersion = mapUnicodeVersion(version);

    const ucdUrl = `https://www.unicode.org/Public/${ucdVersion}/${ucdVersion.includes("Update") ? "" : "ucd"}`;

    versions.push({
      version,
      documentationUrl,
      date: dateMatch[1],
      ucdUrl,
    });
  }

  if (versions.length === 0) {
    return createError(c, 404, "No Unicode versions found");
  }

  // sort versions by date in descending order
  versions.sort((a, b) => Number.parseInt(b.date) - Number.parseInt(a.date));

  return c.json(versions, 200);
});

app.onError(async (err, c) => {
  console.error(err);
  const url = new URL(c.req.url);
  if (err instanceof HTTPException) {
    return c.json({
      path: url.pathname,
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    } satisfies ApiError, err.status);
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  } satisfies ApiError, 500);
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  } satisfies ApiError, 404);
});

export default app;
