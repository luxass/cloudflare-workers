import type { UnicodeVersion as UnicodeToolsUnicodeVersion } from "@luxass/unicode-utils";
import type { HonoContext } from "../types";
import { cache, createError } from "@cf-workers/helpers";
import { mapUnicodeVersion } from "@luxass/unicode-utils";
import { Hono } from "hono";

export const V1_UNICODE_VERSION_ROUTER = new Hono<HonoContext>();
type UnicodeVersion = Record<keyof UnicodeToolsUnicodeVersion, string>;

V1_UNICODE_VERSION_ROUTER.get(
  "/",
  cache({
    cacheName: "unicode-tools-versions",
    cacheControl: "max-age=3600, stale-while-revalidate=3600",
  }),
  async (c) => {
    const response = await fetch("https://www.unicode.org/versions/enumeratedversions.html");
    if (!response.ok) {
      return createError(c, 502, "failed to fetch unicode data");
    }

    const html = await response.text();

    // find any table that contains Unicode version information
    const versionPattern = /Unicode \d+\.\d+\.\d+/;
    const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/g)?.find((table) =>
      versionPattern.test(table),
    );

    if (!tableMatch) {
      return createError(c, 500, "Unicode versions table not found");
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
  },
);
