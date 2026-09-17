import type { Anchor } from "./types.js";
/** The validated anchor request: exactly one resolvable target. */
export type AnchorTarget = {
    strategy: "code";
    artifactPath: string;
    symbolName: string;
} | {
    strategy: "content";
    artifactPath: string;
    heading: string;
};
export interface ResolveAnchorOptions {
    /** Where the target's artifactPath resolves; required when anchoring unless readArtifact is given. */
    repoRoot?: string;
    /** Injection point for tests / hosts that already hold artifact sources. */
    readArtifact?: (artifactPath: string) => string | undefined;
    /** Error-message voice: every refusal is prefixed with the caller's own
     * name ("remember:", "reAnchor:"), so capture and repair share one
     * resolution while each module's errors read as its own. */
    verb: string;
}
/**
 * Exact-match resolution against the artifact's real source, routed by the
 * shared extension registry (anchor/locate-any.ts) — the same map drift's
 * locateAnchor uses, so capture, repair, and drift can never disagree about
 * which files take which strategy. An unknown extension refuses in the
 * caller's voice, and a request whose strategy contradicts the registry
 * refuses rather than mis-parsing the artifact. Zero matches refuses naming
 * the available candidates; more than one refuses naming every candidate
 * locator — an arbitrary pick among same-named candidates is how drift is
 * born.
 *
 * Shared by capture and repair (Seam 4): a re-anchor must never succeed where
 * a fresh remember of the same anchor would refuse.
 */
export declare function resolveAnchor(target: AnchorTarget, opts: ResolveAnchorOptions): Anchor;
