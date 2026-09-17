import type { MemoryNode } from "../store/types.js";
export interface RetireOptions {
    /** Moment of retirement (ISO 8601). Defaults to now; exposed for
     * deterministic tests. */
    now?: string;
}
/**
 * Retirement closes a belief's valid-time window in place — `validTo = now`,
 * `retiredReason` recorded — and is deliberately not a new belief: no
 * tombstone node, no supersession edge. The node leaves "current" through
 * the existing valid-window filter in retrieval and stays visible to asOf;
 * git carries the retirement itself. A second retirement refuses:
 * idempotence is not desired — a repeated retirement is a mistake to
 * surface, not to absorb.
 */
export declare function retire(memoryDir: string, nodes: readonly MemoryNode[], nodeId: string, reason: string, opts?: RetireOptions): MemoryNode;
