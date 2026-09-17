import type { MemoryNode, NodeKind } from "../store/types.js";
/**
 * Every node needs a one-line preview — recall previews on it within budget,
 * and the generated INDEX.md prints one per current node — but not every
 * caller supplies one. This derives it from the body: the first sentence of
 * the first line, capped to ~120 chars, so a summary-less node still has
 * something skimmable instead of an empty column.
 */
export declare function deriveSummary(body: string): string;
/**
 * The node factory: store-wide frontmatter defaults live here and nowhere
 * else, so every writer — capture, re-anchor, retire — stamps identical
 * shapes instead of hand-assembling nodes. Explicit values
 * in `partial` win — that is the one construction path for callers that need
 * to thread resolved anchors or a deterministic test clock through. `version`
 * is the frontmatter format version: 1 today; a real format change bumps it
 * and hangs migration off it, instead of guessing a file's vintage. `summary`
 * sits right after `id` so it serializes near the top of the frontmatter —
 * the field a human skims first.
 */
export declare function createNode(partial: Partial<MemoryNode> & {
    kind: NodeKind;
    body: string;
}): MemoryNode;
