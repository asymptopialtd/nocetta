import type { Worklist } from "../facade/open.js";
import type { SearchResult } from "../retrieval/types.js";
import type { StoreIssue } from "../store/store.js";
import type { MemoryNode } from "../store/types.js";
/**
 * The wire shape of a CURRENT memory (light 7): what an agent acts on —
 * identity, class, authority, anchor locators, body — and nothing else.
 * Validity windows are deliberately absent: currency is the pipeline's
 * decision, not the agent's to re-litigate (that judgment is why nocetta
 * exists), and a date in every result line is an invitation to second-guess
 * it. Window-bearing results are the as-of view's job (ShapedBelief). Anchor
 * hashes, edge lists and the rest of the frontmatter stay on disk; a tool
 * result that carries engine plumbing is a budget leak.
 */
export interface ShapedNode {
    id: string;
    kind: string;
    authority: string;
    scope: string;
    /** Anchor locators only ("src/foo.ts › function foo") — never hashes. */
    anchor: string[];
    /** Present only when retire() closed the node (then the reason matters). */
    retiredReason?: string;
    /** One-line preview. Absent only for a node written before the field
     * existed and never re-anchored/superseded since. */
    summary?: string;
    /** The git commit this fact ties to, when the caller supplied one. */
    commit?: string;
    body: string;
}
/** The as-of view: superseded and retired beliefs, where the validity window
 * is not plumbing but the answer. */
export interface ShapedBelief extends ShapedNode {
    validFrom: string;
    validTo: string | null;
}
/** A ranked node: the same shape plus the ranking score, rounded — the order
 * is what matters to the caller, not the third decimal. */
export interface ShapedHit extends ShapedNode {
    score: number;
}
export declare function shapeNode(node: MemoryNode): ShapedNode;
export declare function shapeBelief(node: MemoryNode): ShapedBelief;
export declare function shapeHit(result: SearchResult): ShapedHit;
/** One JSON object per line: an agent reads a result list without a parser
 * and can quote a single line back verbatim. */
export declare function shapeLines(shaped: readonly unknown[]): string;
/**
 * The worklist in one object. Dirty nodes carry their reason verbatim and the
 * artifactPath a repair request needs; the repair pointer travels with the
 * data (only when there is something to repair) so the worklist teaches its
 * own next action instead of dead-ending, which is how check() lost the loop.
 */
export declare function shapeWorklist(worklist: Worklist, issues: readonly StoreIssue[]): string;
