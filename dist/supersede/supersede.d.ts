import type { MemoryNode } from "../store/types.js";
export interface SupersedeOptions {
    /** This new node also restates an older node (walk-back provenance) — a
     * fresh node that returns to an earlier belief, never an edge back to the
     * original (the supersession relation stays acyclic). */
    restates?: string;
    /** Moment of supersession (ISO 8601). Defaults to now; exposed for
     * deterministic tests. Stamps old.validTo (closing its valid-time window)
     * and next.validFrom/next.txnTime (opening the new one). */
    now?: string;
}
/**
 * Non-destructive supersession: `old` is never deleted, only edged forward.
 * Returns updated copies of both nodes for the caller to persist (via
 * store.writeNode) — supersede() itself does no I/O.
 *
 * - old gets `superseded-by -> next.id` (propagates authority forward), and
 *   its valid-time window closes: `validTo = now`.
 * - next gets `supersedes -> old.id`, and `restates -> opts.restates` if
 *   given; its valid-time window opens: `validFrom = txnTime = now`.
 * - Guards: old must not already be superseded (fan-out is disallowed — a
 *   fact has exactly one next version); the new edge must not close a cycle
 *   (fan-in — multiple olds superseded by the same new — is fine and needs
 *   no special-casing, since each old's edge is independent).
 */
export declare function supersede(nodes: readonly MemoryNode[], oldId: string, next: MemoryNode, opts?: SupersedeOptions): {
    old: MemoryNode;
    next: MemoryNode;
};
