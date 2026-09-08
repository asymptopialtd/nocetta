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
  kind: NodeKind;
  scope: string;
  anchors: Anchor[];
  edges: EdgeRef[];
  validFrom: string;
  validTo: string | null;
  txnTime: string;
  authority: Authority;
  overrideReason: string | null;
  body: string;
  /** Frontmatter format version (createNode stamps 1). Optional: files
   * written before the field existed must still parse as-is. */
  version?: number;
  /** `entity` nodes only: alternate names resolved to this canonical node
   * (the canonical name itself is the node's `body`). Slice 8. */
  aliases?: string[];
}
