import type { MemoryNode } from "../store/types.js";
/**
 * The one-hop "continuity worklist" primitive: ids of nodes directly
 * `anchored-to` a just-superseded node. This is deliberately a single hop
 * (not woven into Slice 3's check() propagation, which has the opposite
 * rule — it stops relaying *through* a superseded node) — superseding a
 * node is itself a fresh signal to that node's own dependents that the
 * belief they anchored to has moved on. Slice 8 builds the full lore-fact
 * continuity worklist demo on top of this same primitive.
 */
export declare function retconImpact(nodes: MemoryNode[], supersededId: string): string[];
