import type { Authority, MemoryNode, NodeKind } from "../store/types.js";
export interface RememberRequest {
    body: string;
    kind: NodeKind;
    /** One-line human-readable preview. Optional: createNode derives a
     * fallback from the body when omitted, so every node still carries one. */
    summary?: string;
    /** Repo-relative. Required when symbolName or heading is given. */
    artifactPath?: string;
    /** Code anchor: exact symbol-name match. Mutually exclusive with heading. */
    symbolName?: string;
    /** Content anchor: exact heading match. Mutually exclusive with symbolName. */
    heading?: string;
    /** Defaults to "global". */
    scope?: string;
    /** Defaults to "default". */
    authority?: Authority;
    /** Capture-as-supersession: the new node supersedes this id in one call. */
    supersedes?: string;
    /** The git commit this fact ties to. Stored and surfaced only — nocetta
     * never interprets or verifies it. */
    commit?: string;
}
export interface RememberOptions {
    /** Where `artifactPath` resolves; required when anchoring unless readArtifact is given. */
    repoRoot?: string;
    /** Injection point for tests / hosts that already hold artifact sources. */
    readArtifact?: (artifactPath: string) => string | undefined;
    /** Deterministic timestamps in tests. */
    now?: string;
}
/**
 * Capture: validate → resolve the anchor against the artifact's real source →
 * build via createNode → supersede in memory → collect conflict and duplicate
 * advisories → persist through the writeNode choke-point. The never-leak gate
 * stays inside writeNode (nothing here re-implements or bypasses it);
 * advisories are advisory only — they come back as `warnings` and never block
 * a write.
 * Resolution is the shared exact-match machinery (anchor/resolve.ts) called
 * in capture's own voice, so repair can never resolve where capture refuses.
 */
export declare function remember(memoryDir: string, nodes: readonly MemoryNode[], req: RememberRequest, opts?: RememberOptions): {
    node: MemoryNode;
    superseded: MemoryNode | null;
    warnings: string[];
};
