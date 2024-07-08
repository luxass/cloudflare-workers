import type { z } from "zod";
import type { Language, Repository } from "github-schema";
import type { PROJECTRC_SCHEMA } from "./projectrc-schema";

type SafeOmit<T, K extends keyof T> = Omit<T, K>;

type ResolvedProject = SafeOmit<z.infer<typeof PROJECTRC_SCHEMA>, "readme" | "workspace" | "stars" | "npm" | "version"> & {
  /**
   * The name of the project
   */
  name: string;

  /**
   * URL to the readme file
   *
   * NOTE:
   * We are not including the full readme in the response,
   * due to some readme files being very large.
   */
  readme?: string;

  /**
   * The number of stars the repository has
   */
  stars?: number;

  /**
   * The npm configuration
   */
  npm?: SafeOmit<Exclude<NonNullable<z.infer<typeof PROJECTRC_SCHEMA>["npm"]>, boolean>, "enabled"> & {
    url?: string;
  };

  /**
   * The version of the project
   */
  version?: string;
};

export type Project = ResolvedProject & Pick<Repository, "nameWithOwner" | "pushedAt" | "url"> & {
  defaultBranch?: string;
  isContributor: boolean;
  language?: Pick<Language, "name" | "color">;
};

export interface Env {
  GITHUB_TOKEN: string;
  API_TOKEN: string;
}

export interface GitTree {
  /** @description The file referenced in the tree. */
  path?: string;
  /**
   * @description The file mode; one of `100644` for file (blob), `100755` for executable (blob), `040000` for subdirectory (tree), `160000` for submodule (commit), or `120000` for a blob that specifies the path of a symlink.
   * @enum {string}
   */
  mode?: "100644" | "100755" | "040000" | "160000" | "120000";
  /**
   * @description Either `blob`, `tree`, or `commit`.
   * @enum {string}
   */
  type?: "blob" | "tree" | "commit";
  /**
   * @description The SHA1 checksum ID of the object in the tree. Also called `tree.sha`. If the value is `null` then the file will be deleted.
   *
   * **Note:** Use either `tree.sha` or `content` to specify the contents of the entry. Using both `tree.sha` and `content` will return an error.
   */
  sha?: string | null;
  /**
   * @description The content you want this file to have. GitHub will write this blob out and use that SHA for this entry. Use either this, or `tree.sha`.
   *
   * **Note:** Use either `tree.sha` or `content` to specify the contents of the entry. Using both `tree.sha` and `content` will return an error.
   */
  content?: string;
};
