import type { MemoryNode } from "../store/types.js";
/**
 * Transaction-time query: reconstruct the belief the graph held as of
 * `atTxnTime` — as if querying the append-only log at that moment, before
 * any later write happened.
 *
 * A node is eligible only if it was already written by then (`txnTime <=
 * atTxnTime`). Among eligible nodes, one is excluded if its immediate
 * successor (`superseded-by` target) was *also* already written by then —
 * i.e. it had already been superseded, as of that moment. This is a
 * single-hop check per node (not a tip-walk): for a chain A -> B -> A''
 * written at t1 < t2 < t3, asOf(t) between t1 and t2 yields {A} (B doesn't
 * exist yet, so A's successor-check finds nothing eligible); between t2 and
 * t3 yields {B} (A is excluded — its successor B existed by t; B has no
 * eligible successor yet); at or after t3 yields {A''} (A and B are both
 * excluded, each superseded by an eligible successor).
 */
export declare function asOf(nodes: MemoryNode[], atTxnTime: string): MemoryNode[];
