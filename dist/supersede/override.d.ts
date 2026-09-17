import type { SupersedeOptions } from "./supersede.js";
import type { MemoryNode } from "../store/types.js";
/**
 * Override a `default`-authority value/decision node, recording a mandatory
 * reason on the overriding node. An `invariant` node may never be
 * overridden this way (per the plan: "an invariant may not [be overridden]")
 * — attempting it is a hard error, not a silent no-op or a downgrade.
 */
export declare function overrideValue(nodes: readonly MemoryNode[], oldId: string, next: MemoryNode, reason: string, opts?: SupersedeOptions): {
    old: MemoryNode;
    next: MemoryNode;
};
