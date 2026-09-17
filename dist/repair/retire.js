import { writeNode } from "../store/store.js";
/**
 * Retirement closes a belief's valid-time window in place — `validTo = now`,
 * `retiredReason` recorded — and is deliberately not a new belief: no
 * tombstone node, no supersession edge. The node leaves "current" through
 * the existing valid-window filter in retrieval and stays visible to asOf;
 * git carries the retirement itself. A second retirement refuses:
 * idempotence is not desired — a repeated retirement is a mistake to
 * surface, not to absorb.
 */
export function retire(memoryDir, nodes, nodeId, reason, opts = {}) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node)
        throw new Error(`retire: unknown node "${nodeId}"`);
    if (!reason.trim()) {
        throw new Error("retire: a non-empty reason is required");
    }
    if (node.retiredReason !== null && node.retiredReason !== undefined) {
        throw new Error(`retire: "${nodeId}" is already retired (reason: "${node.retiredReason}")`);
    }
    const retired = {
        ...node,
        validTo: opts.now ?? new Date().toISOString(),
        retiredReason: reason,
    };
    writeNode(memoryDir, retired);
    return retired;
}
