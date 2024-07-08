import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { Plugin } from "unified";
import { remove } from "unist-util-remove";

interface Options {
  name: string;
  icons: Map<string, string>;
}

export const ICON: Plugin<Options[], Root> = (options: Options) => {
  const { name, icons } = options;
  return (tree) => {
    visit(tree, "heading", (node) => {
      if (node.depth === 1) {
        const text = node.children[0] as Text;
        const matched = text.value.match(/\p{Emoji}/u);
        if (!matched) return;

        const emoji = matched[0];
        // eslint-disable-next-line no-console
        console.log(`found emoji for ${name}: ${emoji}`);
        icons.set(name, emoji);
      }
    });
    remove(tree, (it) => it.type === "heading" && "depth" in it && it.depth === 1);
  };
};
