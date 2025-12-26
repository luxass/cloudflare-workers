import { z } from "@hono/zod-openapi";

export const ReleaseSchema = z.object({
  tag: z.string().openapi({
    description: "The tag of the release",
  }),
  url: z.string().openapi({
    description: "The URL of the release",
  }),
  commit: z.string().optional().openapi({
    description: "The commit SHA of the release",
  }),
}).openapi("Release");

export const BuiltinExtensionsSchema = z.object({
  extensions: z.array(
    z.string(),
  ).openapi({
    description: "The list of builtin extensions",
  }),
}).openapi("BuiltinExtensions", {
  description: "A list of builtin extensions",
});

const Person = z.union([
  z.string(),
  z.object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  }),
]);

const Funding = z.union([
  z.string(),
  z.object({
    url: z.string(),
    type: z.string().optional(),
  }),
  z.array(
    z.union([
      z.string(),
      z.object({
        url: z.string(),
        type: z.string().optional(),
      }),
    ]),
  ),
]);

const Repository = z.union([
  z.string(),
  z.object({
    /** Repository type (e.g., `git`). */
    type: z.string(),

    /** Machine-readable repository URL (e.g., `https://github.com/user/repo.git`). */
    url: z.string(),

    /** Directory in a monorepo where the package's source code is located. */
    directory: z.string().optional(),
  }),
]);

export const BuiltinExtensionSchema = z.object({
  name: z.string().openapi({
    description: "The package name of the extension",
  }),

  version: z.string().openapi({
    description: "The version of the extension",
  }),

  description: z.string().openapi({
    description: "The description of the extension",
  }),

  keywords: z.array(z.string()).optional().openapi({
    description: "Keywords for searching the package",
  }),

  homepage: z.string().optional().openapi({
    description: "The URL of the package homepage",
  }),

  bugs: z.union([
    z.string().openapi({
      description: "The URL of the issue tracker",
    }),
    z.object({
      url: z.string().openapi({
        description: "The URL of the issue tracker",
      }),
      email: z.string().optional().openapi({
        description: "The email of the issue tracker",
      }),
    }),
  ]).optional().openapi({
    description: "The issue tracker for the package",
  }),

  license: z.string().optional().openapi({
    description: "The license of the package",
  }),

  /** Author of the package. */
  author: Person.optional().openapi({
    description: "The author of the package",
  }),

  /** Contributors to the package. */
  contributors: z.array(Person).optional().openapi({
    description: "Contributors to the package",
  }),

  /** Maintainers of the package. */
  maintainers: z.array(Person).optional().openapi({
    description: "Maintainers of the package",
  }),

  /** Funding options for the package. */
  funding: Funding.optional(),

  /** File patterns for files to be included when publishing the package. */
  files: z.array(z.string()).optional(),

  /** Main entry point for the package, usually CommonJS. */
  main: z.string().optional(),

  /**
    Main entry point for the package when used in a browser environment.
    @see {@link https://docs.npmjs.com/cli/v10/configuring-npm/package-json#browser}
    @see {@link https://gist.github.com/defunctzombie/4339901/49493836fb873ddaa4b8a7aa0ef2352119f69211}
   */
  browser: z.union([z.string(), z.record(z.string(), z.union([z.string(), z.boolean()]))]).optional(),

  /** Executable files. */
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),

  /** Documentation to be used with the `man` command. */
  man: z.union([z.string(), z.array(z.string())]).optional(),

  /** Directories in the package. */
  directories: z.record(z.string(), z.string()).optional(),

  /** Repository for the package's source code. */
  repository: Repository.optional(),

  /** Scripts used in the package. */
  scripts: z.record(z.string(), z.string()).optional(),

  /** Configuration values for scripts. */
  config: z.record(z.string(), z.unknown()).optional(),

  /** Production dependencies. */
  dependencies: z.record(z.string(), z.string()).optional(),

  /** Development dependencies. */
  devDependencies: z.record(z.string(), z.string()).optional(),

  /** Peer dependencies. */
  peerDependencies: z.record(z.string(), z.string()).optional(),

  /** Metadata about peer dependencies. */
  peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean() })).optional(),

  /** Dependencies bundled with the package. */
  bundleDependencies: z.union([z.boolean(), z.array(z.string())]).optional(),

  /** Dependencies bundled with the package (equivalent to `bundleDependencies`). */
  bundledDependencies: z.union([z.boolean(), z.array(z.string())]).optional(),

  /** Optional dependencies. */
  optionalDependencies: z.record(z.string(), z.string()).optional(),

  /** Overrides for dependency resolution using npm. */
  overrides: z.record(z.string(), z.unknown()).optional(),

  /** Runtime systems supported by the package. */
  engines: z.union([
    z.record(z.string(), z.string()),
    z.object({
      vscode: z.string().openapi({
        description: "For VS Code extensions, specifies the VS Code version that the extension is compatible with. Cannot be *. For example: ^0.10.5 indicates compatibility with a minimum VS Code version of 0.10.5.",
        default: "^1.22.0",
      }),
    }),
  ]).optional().openapi({
    description: "Runtime systems supported by the package",
  }),

  /** Operating systems supported by the package. */
  os: z.array(z.string()).optional(),

  /** CPU architectures supported by the package. */
  cpu: z.array(z.string()).optional(),

  /** True if the package should not be published. */
  private: z.boolean().optional(),

  /** Configuration values used at publishing time. */
  publishConfig: z.record(z.string(), z.unknown()).optional(),

  /** File patterns for locating local workspaces. */
  workspaces: z.array(z.string()).optional(),

  /** Deprecation message. */
  deprecated: z.string().optional(),

  /** Main ESM entry point for the package. */
  module: z.string().optional(),

  /** Type for all the `.js` files in the package, usually `module`. */
  type: z.union([z.literal("module"), z.literal("commonjs")]).optional(),

  /** Main TypeScript declaration file. */
  types: z.string().optional(),

  /** Main TypeScript declaration file (equivalent to `types`). */
  typings: z.string().optional(),

  /**
    TypeScript types resolutions.
    @see {@link https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html#version-selection-with-typesversions}
   */
  typesVersions: z.record(z.string(), z.record(z.string(), z.array(z.string()))).optional(),

  /**
    Corepack package manager.
    @see {@link https://nodejs.org/api/corepack.html}
   */
  packageManager: z.string().optional(),

  /**
    False if importing modules from the package does not cause side effects.
    True or a list of file patterns if importing modules from the package causes side effects.
    @see {@link https://webpack.js.org/guides/tree-shaking/#mark-the-file-as-side-effect-free}
   */
  sideEffects: z.union([z.boolean(), z.array(z.string())]).optional(),

  /**
    Imports map.
    @see {@link https://nodejs.org/api/packages.html#imports}
   */
  imports: z.record(z.string(), z.unknown()).optional(),

  /**
    Package exports.
    @see {@link https://nodejs.org/api/packages.html#exports}
   */
  exports: z.union([z.null(), z.string(), z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),

  publisher: z.string().openapi({
    description: "The publisher of the extension",
  }),

  displayName: z.string().openapi({
    description: "The display name for the extension used in the VS Code gallery.",
  }),

  icon: z
    .string()
    .optional()
    .openapi({
      description: "The path to a 128x128 pixel icon.",
    }),
  l10n: z
    .string()
    .describe(
      "The relative path to a folder containing localization (bundle.l10n.*.json) files. Must be specified if you are using the vscode.l10n API.",
    )
    .optional(),
  pricing: z.enum(["Free", "Trial"]).optional().openapi({
    description: "The pricing model for the extension",
  }),
}).loose().openapi("BuiltinExtension", {
  description: "A package.json that describes a builtin extension",
});
