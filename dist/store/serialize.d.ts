import type { MemoryNode } from "./types.js";
/** Markdown file body: YAML frontmatter delimited by `---` lines, then prose body. */
export declare function serializeNode(node: MemoryNode): string;
export declare function parseNode(text: string): MemoryNode;
