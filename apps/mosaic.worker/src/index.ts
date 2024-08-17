import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { graphql } from "@octokit/graphql";
import { type Repository, type User, gql } from "github-schema";

export interface HonoContext {
  Bindings: {
    GITHUB_TOKEN: string;
    ENVIRONMENT: string;
    DATABASE: D1Database;
  };
}

const app = new Hono<HonoContext>();

app.get("/view-source", (c) => {
  return c.redirect("https://github.com/luxass/cloudflare-workers/tree/main/apps/mosaic.worker", 301);
});

app.get("/ping", (c) => {
  c.status(418);
  return c.text("pong!");
});

app.get("/repositories", async (c) => {
  const { results } = await c.env.DATABASE.prepare(
    "SELECT * FROM repositories",
  )
    .run();

  return c.json(results.map((row) => ({
    github_id: row.github_id,
    name_with_owner: row.name_with_owner,
    name: row.name,
    url: row.url,
  })));
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
    });
  }

  return c.json({
    path: url.pathname,
    status: 500,
    message: "Internal server error",
    timestamp: new Date().toISOString(),
  });
});

app.notFound(async (c) => {
  const url = new URL(c.req.url);
  return c.json({
    path: url.pathname,
    status: 404,
    message: "Not found",
    timestamp: new Date().toISOString(),
  });
});

const REPOSITORY_FRAGMENT = gql`
  #graphql
  fragment RepositoryFragment on Repository {
    id
    name
    isFork
    isArchived
    nameWithOwner
    description
    pushedAt
    url
    defaultBranchRef {
      name
    }
    primaryLanguage {
      name
      color
    }
  }
`;

const PROFILE_QUERY = gql`
  #graphql
  ${REPOSITORY_FRAGMENT}

  query getProfile() {
    viewer {
      repositories(
        first: 100
        isFork: false
        privacy: PUBLIC
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        totalCount
        nodes {
          ...RepositoryFragment
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

export default {
  fetch: app.fetch,
  scheduled: async (event, env) => {
    const { viewer } = await graphql<{
      viewer: User;
    }>(PROFILE_QUERY, {
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!viewer.repositories.nodes?.length) {
      console.warn("no repositories found");
      return undefined;
    }

    const ignoreFile = await fetch("https://raw.githubusercontent.com/luxass/luxass/main/.github/mosaic/.mosaicignore").then((res) => res.text());
    const ignore = ignoreFile.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

    const repositories = viewer.repositories.nodes.filter((repo): repo is NonNullable<Repository> => {
      return (
        !!repo
        && !repo.isFork
        && !repo.isPrivate
        && !repo.isArchived
        && !ignore.includes(repo.nameWithOwner)
        && !ignore.includes(repo.nameWithOwner.split("/")[1])
      );
    });

    const mosaicUrl = env.ENVIRONMENT !== "production" && env.ENVIRONMENT === "preview" ? "https://mosaic.luxass.dev" : "http://localhost:3000";

    const repositoriesWithConfigs = await Promise.all(repositories.map(async (repo) => {
      const data = await fetch(`${mosaicUrl}/api/v1/mosaic/${repo.nameWithOwner}/config`).then((res) => res.json());

      if (!data) {
        return undefined;
      }

      if (typeof data === "object" && "message" in data) {
        console.warn(data.message);
        return undefined;
      }

      return {
        ...repo,
        config: data,
      };
    }));

    // delete all repositories where github_id is not in the list
    const githubIdsToKeep = repositoriesWithConfigs.map((repo) => repo?.id).filter((id) => id !== undefined);

    console.warn("will delete repositories that doesn't exist in the list", githubIdsToKeep);

    // delete all repositories where github_id is not in the list
    await env.DATABASE.prepare(
      `DELETE FROM repositories WHERE github_id NOT IN (${githubIdsToKeep.map(() => "?").join(", ")})`,
    )
      .bind(...githubIdsToKeep)
      .run();

    for (const repositoryWithConfig of repositoriesWithConfigs) {
      if (!repositoryWithConfig) {
        continue;
      }

      // check if repository already exists
      const { results } = await env.DATABASE.prepare(
        `SELECT * FROM repositories WHERE name_with_owner = ? AND github_id = ? AND url = ?`,
      )
        .bind(repositoryWithConfig.nameWithOwner, repositoryWithConfig.id, repositoryWithConfig.url)
        .run();

      if (results.length > 0) {
        // eslint-disable-next-line no-console
        console.info(`repository ${repositoryWithConfig.nameWithOwner} already exists`);
        continue;
      }

      // insert repository into database
      await env.DATABASE.prepare(
        `INSERT INTO repositories (github_id, name_with_owner, name, url) VALUES (?, ?, ?, ?)`,
      )
        .bind(repositoryWithConfig.id, repositoryWithConfig.nameWithOwner, repositoryWithConfig.name, repositoryWithConfig.url)
        .run();
    }
  },
} satisfies ExportedHandler<HonoContext["Bindings"]>;