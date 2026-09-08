import yaml from "js-yaml";
import type { MemoryNode } from "./types.js";

const DELIM = "---";

/** Markdown file body: YAML frontmatter delimited by `---` lines, then prose body. */
export function serializeNode(node: MemoryNode): string {
  const { body, ...frontmatter } = node;
  const yamlText = yaml.dump(frontmatter, { sortKeys: false, lineWidth: -1 });
  return `${DELIM}\n${yamlText}${DELIM}\n\n${body.trim()}\n`;
}

export function parseNode(text: string): MemoryNode {
  const lines = text.split("\n");
  if (lines[0] !== DELIM) {
    throw new Error("malformed memory file: missing opening frontmatter delimiter");
  }
  const closeIdx = lines.indexOf(DELIM, 1);
  if (closeIdx === -1) {
    throw new Error("malformed memory file: missing closing frontmatter delimiter");
  }
  const yamlText = lines.slice(1, closeIdx).join("\n");
  const body = lines
    .slice(closeIdx + 1)
    .join("\n")
    .trim();
  const frontmatter = (yaml.load(yamlText) ?? {}) as Omit<MemoryNode, "body">;
  return { ...frontmatter, body };
}
