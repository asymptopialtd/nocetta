import type { MemoryNode } from "../store/types.js";
/**
 * The Slice 8 headline demo primitive: the full node objects (not just ids)
 * that are `anchored-to` a node which just got superseded — the worklist of
 * memories an agent should re-check for continuity after a retcon. Thin
 * wrapper over Slice 5's retconImpact; named for this domain because the
 * plan calls it out as a first-class concept ("the continuity worklist").
 */
export declare function continuityWorklist(nodes: MemoryNode[], supersededId: string): MemoryNode[];
