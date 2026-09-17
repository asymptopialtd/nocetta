import type { MemoryNode } from "../store/types.js";
export interface ReAnchorRequest {
    /** Code anchor: exact symbol-name match (same semantics as capture). */
    symbolName?: string;
    /** Content anchor: exact heading match. */
    heading?: string;
}
export interface ReAnchorOptions {
    /** Where the node's anchored artifactPaths resolve; required when the node
     * has anchors unless readArtifact is given. */
    repoRoot?: string;
    /** Injection point for tests / hosts that already hold artifact sources. */
    readArtifact?: (artifactPath: string) => string | undefined;
}
/**
 * Identity repair, in place (Seam 4): the anchor's locator + hash are
 * re-resolved against the artifact's current source and rewritten; the
 * belief, its body, and its valid-time window (validFrom/validTo/txnTime)
 * are untouched — the belief didn't change, and git carries the repair
 * history. No new node, no supersession edge. Resolution rides the shared
 * extract-and-exact-match machinery, so a repair never succeeds where a
 * fresh remember of the same anchor would refuse. A superseded node refuses:
 * repair is for live nodes — supersession already owns the dead ones.
 */
export declare function reAnchor(memoryDir: string, nodes: readonly MemoryNode[], nodeId: string, req: ReAnchorRequest, opts?: ReAnchorOptions): MemoryNode;
