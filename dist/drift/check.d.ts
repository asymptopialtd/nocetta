import type { SymbolLocator } from "../anchor/locator.js";
import type { MemoryNode } from "../store/types.js";
import type { RepoState } from "./repo-state.js";
export interface CheckResult {
    dirty: Set<string>;
    /** short human-readable reason per dirty node id, for debuggability. */
    reasons: Map<string, string>;
}
/**
 * Recompute every anchor's hash against `repoState` and flag dirty nodes.
 *
 * A node is directly dirty if any of its own anchors no longer resolve
 * (symbol not found — renamed/deleted/artifact missing) or resolve with a
 * changed hash (body edited). Dirtiness then propagates along `anchored-to`
 * edges (a node with `anchored-to → X` inherits X's dirtiness), stopping at
 * superseded nodes: propagation does not continue past a node that already
 * carries a `superseded-by` edge, since a superseded node is already
 * excluded from "current" and chasing its dependents further is moot.
 */
export declare function check(nodes: MemoryNode[], repoState: RepoState, locator?: SymbolLocator): CheckResult;
/** Minimal "current" view for Slice 3: every node not flagged dirty. Slice 4
 * builds this out into the full candidate → resolve-tip → scope/window →
 * rank → budget pipeline; this is the drift-exclusion half of that. */
export declare function currentNodes(nodes: MemoryNode[], repoState: RepoState, locator?: SymbolLocator): MemoryNode[];
