import { writeFile } from "node:fs/promises";
import process from "node:process";
import { Lang, parse } from "@ast-grep/napi";

async function run() {
  const res = await fetch("https://raw.githubusercontent.com/microsoft/vscode-vsce/refs/heads/main/src/package.ts");

  if (!res.ok) {
    throw new Error(`failed to fetch file: ${res.statusText}`);
  }

  const text = await res.text();

  const ast = parse(Lang.TypeScript, text);

  const root = ast.root();
  const node = root.find("const TrustedSVGSources = $VALUE;");

  if (node == null) {
    throw new Error("failed to find node");
  }

  const match = node.getMatch("VALUE");

  console.log("match:");
  if (match == null) {
    throw new Error("failed to find match");
  }

  const sources = JSON.parse(match.text().replace(/'/g, "\"").replace(/,(\s*[}\]])/g, "$1").trim());

  // write sources to file
  await writeFile("./src/trusted-svg-sources.ts", `export const trustedSources = ${JSON.stringify(sources, null, 2)};`);

  console.log("done");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
