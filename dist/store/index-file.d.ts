import type { MemoryNode } from "./types.js";
/**
 * Whether a node counts as "current" for a human-facing listing: not
 * superseded (edged forward via `superseded-by`), and inside its valid-time
 * window. This mirrors the facade worklist's own currency filter exactly —
 * a node dropped from the worklist's live view is dropped from the index
 * too, so the two surfaces can never disagree about what "current" means.
 */
export declare function isCurrent(node: MemoryNode, now: string): boolean;
/**
 * Pure rendering (Slice-style: testable without touching disk). Decision
 * 162d74f3: the committed store is read by humans too, and a folder of raw
 * frontmatter files is unreadable without the MCP server running — this is
 * the generated, always-current human affordance the old ~/.claude MEMORY.md
 * gave by hand.
 */
export declare function renderIndex(nodes: readonly MemoryNode[], now?: string): string;
/**
 * Regenerate the index at `<storeRoot>/INDEX.md` — the parent of MEMORY_DIR,
 * never inside it, or readStore would try to parse it as a node. Fully
 * rewritten from the current node set on every call; never hand-maintained,
 * so it can never go stale the way a hand-kept MEMORY.md would.
 */
export declare function writeIndex(storeRoot: string, nodes: readonly MemoryNode[], now?: string): void;
