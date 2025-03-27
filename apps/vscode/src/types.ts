import type { $Octokit } from "./utils";

export interface Repository {
  object: RepositoryObject;
}

export interface RepositoryObject {
  entries: Entry[];
}

export interface Entry {
  type: "blob" | "tree";
  name: string;
  path: string;
  pathRaw: string;
  object: {
    entries?: (Omit<Entry, "object">)[];
  };
}

export interface HonoContext {
  Bindings: CloudflareBindings;
  Variables: {
    octokit?: $$Octokit;
  };
}

export type HonoBindings = HonoContext["Bindings"];

export type $$Octokit = InstanceType<typeof $Octokit>;
