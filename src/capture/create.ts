import { randomUUID } from "node:crypto";
import type { MemoryNode, NodeKind } from "../store/types.js";

/**
 * The node factory: store-wide frontmatter defaults live here and nowhere
 * else, so every writer — capture, re-anchor, retire — stamps identical
 * shapes instead of hand-assembling nodes. Explicit values
 * in `partial` win — that is the one construction path for callers that need
 * to thread resolved anchors or a deterministic test clock through. `version`
 * is the frontmatter format version: 1 today; a real format change bumps it
 * and hangs migration off it, instead of guessing a file's vintage.
 */
export function createNode(partial: Partial<MemoryNode> & { kind: NodeKind; body: string }): MemoryNode {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    scope: "global",
    anchors: [],
    edges: [],
    validFrom: now,
    validTo: null,
    txnTime: now,
    authority: "default",
    overrideReason: null,
    retiredReason: null,
    version: 1,
    ...partial,
  };
}
