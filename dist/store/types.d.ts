import type { Anchor } from "../anchor/types.js";
export type NodeKind = "claim" | "value" | "entity" | "lore-fact";
export type Authority = "invariant" | "default";
export type EdgeType = "anchored-to" | "superseded-by" | "supersedes" | "restates";
export interface EdgeRef {
    type: EdgeType;
    /** Node id, or (for `anchored-to`) an artifact path. */
    target: string;
}
/** A memory node: the complete on-disk representation (frontmatter + body). */
export interface MemoryNode {
    id: string;
    /** One-line human-readable preview: what recall previews before spending
     * body budget on the full text, and what the generated INDEX.md prints per
     * node. Optional with a derived-fallback default (same reasoning as
     * `version`): files written before the field existed must still parse
     * as-is; createNode fills a fallback from the body whenever a caller omits
     * one, so every new write carries one regardless. */
    summary?: string;
    kind: NodeKind;
    scope: string;
    anchors: Anchor[];
    edges: EdgeRef[];
    validFrom: string;
    validTo: string | null;
    txnTime: string;
    authority: Authority;
    overrideReason: string | null;
    /** Why the node was retired — set only by retire(), alongside closing
     * validTo. Optional with a null default (same reasoning as `version`):
     * files written before the field existed must still parse as-is. */
    retiredReason?: string | null;
    body: string;
    /** Frontmatter format version (createNode stamps 1). Optional: files
     * written before the field existed must still parse as-is. */
    version?: number;
    /** `entity` nodes only: alternate names resolved to this canonical node
     * (the canonical name itself is the node's `body`). Slice 8. */
    aliases?: string[];
    /** The git commit (short or full SHA, agent-supplied) this fact is tied
     * to — e.g. the commit that landed the behavior a claim describes. Stored
     * and surfaced only; nocetta never interprets or verifies it. Optional:
     * files written before the field existed must still parse as-is. */
    commit?: string;
}
