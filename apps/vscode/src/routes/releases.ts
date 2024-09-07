import { OpenAPIHono } from "@hono/zod-openapi";
import semver from "semver";
import type { HonoContext } from "../types";
import { createError } from "../utils";
import {
  ALL_RELEASES_ROUTE,
  LATEST_RELEASE_ROUTE,
  RELEASE_ROUTE,
} from "./releases.openapi";

export const RELEASES_ROUTER = new OpenAPIHono<HonoContext>();

RELEASES_ROUTER.openapi(ALL_RELEASES_ROUTE, async (ctx) => {
  const octokit = ctx.get("octokit");

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => semver.gte(release.tag_name, "1.45.0")));

  return ctx.json(
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

RELEASES_ROUTER.openapi(LATEST_RELEASE_ROUTE, async (ctx) => {
  const octokit = ctx.get("octokit");

  const { data: releases } = await octokit.request("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 1,
  });

  const release = releases[0];
  if (!("tag_name" in release)) {
    return createError(ctx, 404, "No release found");
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return ctx.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200);
});

RELEASES_ROUTER.openapi(RELEASE_ROUTE, async (ctx) => {
  const octokit = ctx.get("octokit");

  const params = ctx.req.param();
  if (!params || !params.tag) {
    return createError(ctx, 400, "No release tag provided");
  }

  const releases = await octokit.paginate("GET /repos/{owner}/{repo}/releases", {
    owner: "microsoft",
    repo: "vscode",
    per_page: 100,
  }).then((releases) => releases.filter((release) => semver.gte(release.tag_name, "1.45.0")));

  const release = releases.find((release) => release.tag_name === params.tag);

  if (!release) {
    return createError(ctx, 404, "No release found");
  }

  const { data: commit } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: "microsoft",
    repo: "vscode",
    ref: release.tag_name,
    per_page: 1,
  });

  return ctx.json({
    tag: release.tag_name,
    url: release.url,
    commit: commit.sha,
  }, 200);
});
