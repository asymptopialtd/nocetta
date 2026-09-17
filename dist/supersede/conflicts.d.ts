import type { MemoryNode } from "../store/types.js";
export interface Conflict {
    subject: string;
    invariantNode: MemoryNode;
    defaultNode: MemoryNode;
}
/** Exported for duplicates.ts, which must likewise skip pairs a supersession
 * or restatement already relates — the resolution working, not a problem. */
export declare function directlyRelated(a: MemoryNode, b: MemoryNode): boolean;
/**
 * Surface (never auto-resolve) same-subject nodes whose authority classes
 * disagree and which aren't already related by supersession/restatement.
 * Recency wins *within* an authority class; across classes the plan is
 * explicit that conflicts must surface rather than silently pick a winner.
 *
 * Noise discipline: an advisory the reader learns to ignore is worse than no
 * advisory, because it takes real conflicts down with it. Two guards follow
 * from that:
 * - Superseded nodes are dead beliefs; a disagreement among the dead is not
 *   attention-worthy and is skipped outright.
 * - For UNANCHORED nodes the subject is a guess — scope groups them, but scope
 *   is not "about the same thing" (dogfood: a closed-source policy vs a
 *   test-runner preference, same global scope, flagged as contradicting). An
 *   unanchored pair is a candidate only on shared non-ambient vocabulary, and
 *   then a fan-out cap ({@link MAX_UNANCHORED_FANOUT}) drops a node that grazes
 *   many beliefs on a word each rather than disagreeing with one. Anchored
 *   pairs need neither gate — the shared locator IS the subject, and never
 *   grazes.
 */
export declare function findConflicts(nodes: MemoryNode[]): Conflict[];
