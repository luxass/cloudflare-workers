import type { HonoContext } from "../types";
import { createError } from "@cf-workers/helpers";
import { OpenAPIHono } from "@hono/zod-openapi";
import gte from "semver/functions/gte";
import {
  ALL_RELEASES_ROUTE,
  LATEST_RELEASE_ROUTE,
  RELEASE_ROUTE,
} from "./releases.openapi";

export const RELEASES_ROUTER = new OpenAPIHono<HonoContext>();

RELEASES_ROUTER.openapi(ALL_RELEASES_ROUTE, async (c) => {
  const octokit = c.get("octokit");

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => gte(release.tag_name, "1.45.0")));

  return c.json(
    releases.map((release) => ({
      tag: release.tag_name,
      url: release.url,
    })),
    200,
    {
      "Content-Type": "application/json",
    },
  );
});

RELEASES_ROUTER.openapi(LATEST_RELEASE_ROUTE, async (c) => {
  const octokit = c.get("octokit");

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const { data: releases } = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 1,
  });

  const release = releases[0];
  if (!("tag_name" in release)) {
    return createError(c, 404, "No release found");
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return c.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200);
});

RELEASES_ROUTER.openapi(RELEASE_ROUTE, async (c) => {
  const octokit = c.get("octokit");

  const params = c.req.param();
  if (!params || !params.tag) {
    return createError(c, 400, "No release tag provided");
  }

  if (octokit == null) {
    return createError(c, 500, "could not get query github");
  }

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => gte(release.tag_name, "1.45.0")));

  const release = releases.find((release) => release.tag_name === params.tag);

  if (!release) {
    return createError(c, 404, "No release found");
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return c.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200);
});
