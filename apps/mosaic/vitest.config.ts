import path from "node:path";
import { defineWorkersProject, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      name: "mosaic",
      poolOptions: {
        workers: {
          singleWorker: true,
          miniflare: {
            compatibilityFlags: ["nodejs_compat"],
            bindings: {
              ENVIRONMENT: "production",
              TEST_MIGRATIONS: migrations,
            },
          },
          wrangler: {
            configPath: "./wrangler.toml",
          },
        },
      },
    },
  };
});
