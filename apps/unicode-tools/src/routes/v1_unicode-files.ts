import type { HonoContext } from "../types";
import { cache, createError } from "@cf-workers/helpers";
import { mapUnicodeVersion, UNICODE_VERSIONS_WITH_UCD } from "@luxass/unicode-tools";
import { Hono } from "hono";

export const V1_UNICODE_FILES_ROUTER = new Hono<HonoContext>();

interface Entry {
  name: string;
  children?: Entry[];
}

interface UnicodeEntry {
  type: "file" | "directory";
  name: string;
  path: string;
}

V1_UNICODE_FILES_ROUTER.get(
  "/:version",
  cache({
    cacheName: "unicode-tools-files",
    cacheControl: "max-age=604800, stale-while-revalidate=86400",
  }),
  async (c) => {
    const version = c.req.param("version");

    if (!UNICODE_VERSIONS_WITH_UCD.map((v) => v.version).includes(version as typeof UNICODE_VERSIONS_WITH_UCD[number]["version"])) {
      return createError(c, 400, "Unicode version does not have UCD");
    }

    const mappedVersion = mapUnicodeVersion(version);
    if (!mappedVersion) {
      return createError(c, 400, "Invalid Unicode version");
    }

    // eslint-disable-next-line no-console
    console.info({
      version,
      mappedVersion,
    });

    async function processDirectory(entries: UnicodeEntry[]): Promise<Entry[]> {
    // process all directories in parallel
      const dirPromises = entries
        .filter((entry) => entry.type === "directory")
        .map(async (dir) => {
          const response = await fetch(`${c.env.PROXY_URL}/${mappedVersion}/ucd/${dir.path}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch directory: ${dir.path}`);
          }
          const children = await response.json() as UnicodeEntry[];
          const processedChildren = await processDirectory(children);
          return {
            name: dir.name,
            children: processedChildren,
          };
        });

      // process all files
      const fileEntries = entries
        .filter((entry) => entry.type === "file")
        .map((file) => ({
          name: file.name,
        }));

      const dirEntries = await Promise.all(dirPromises);

      return [...fileEntries, ...dirEntries];
    }

    try {
      const response = await fetch(`${c.env.PROXY_URL}/${mappedVersion}/ucd`);
      if (!response.ok) {
        return createError(c, 502, "Failed to fetch root directory");
      }

      const rootEntries = await response.json() as UnicodeEntry[];
      const result = await processDirectory(rootEntries);
      return c.json(result, 200);
    } catch (error) {
      console.error("Error processing directory:", error);
      return createError(c, 500, "Failed to fetch file mappings");
    }
  },
);
