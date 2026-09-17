import type { MemoryNode } from "../store/types.js";
export interface Duplicate {
    /** The two live beliefs that say the same thing — unordered. */
    a: MemoryNode;
    b: MemoryNode;
    /** Combined similarity, 0..1: the better of an idf-weighted containment
     * over the summaries and one over summary+body. Diagnostic only — the
     * thresholds below decide, not the number. */
    score: number;
    /** Locators both sides anchor to. Empty for a vocabulary-only match (the
     * common re-capture: one copy anchored, the other not). */
    sharedAnchors: string[];
}
/**
 * Surface (never auto-resolve) pairs of live beliefs that say the same
 * thing. Convergence stays the caller's move — memory_supersede one side,
 * keeping the better-anchored/worded copy as the tip — because a false
 * positive must never destroy information, the same reason conflicts are
 * advisory. Superseded nodes are dead and skipped outright; pairs already
 * related by a supersession/restatement edge are the resolution working,
 * not a problem. O(n²) over the live set with token sets built once — fine
 * at store scale (hundreds), the same trade findConflicts makes.
 */
export declare function findDuplicates(nodes: MemoryNode[]): Duplicate[];
