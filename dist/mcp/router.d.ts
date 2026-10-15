import type { Nocetta } from "../facade/open.js";
export interface StoreRouterOptions {
    /** The server's launch directory — the base an anchored write's relative
     * artifactPath resolves against, and the start of discovery when the client
     * advertises no roots. Defaults to process.cwd(). */
    base?: string;
    /** NOCETTA_ROOT / --root: when set it FORCES this root for every call and
     * bypasses all per-write resolution (anchored, roots, and the guard). This is
     * the single-project launch's contract and the cross-repo-tooling escape
     * hatch — resolved to an absolute path by the caller. */
    override?: string;
    /** The MCP client's advertised workspace roots as filesystem paths, fetched
     * lazily (the `roots` capability). Undefined/throws when the client doesn't
     * support roots — the router then falls back to discovery from `base`. */
    listRoots?: () => Promise<string[]>;
    /** Store opener; injectable so tests can observe which root each call routes
     * to without touching disk. Defaults to the real facade `open`. */
    openStore?: (root: string) => Nocetta;
}
/**
 * Per-write store resolution for the long-lived MCP server. The server is
 * launched ONCE — often at a parent directory holding many child project repos
 * — but each belief must land in the right project's committed `.nocetta/`
 * store. So the root is resolved per call, from the write itself, never from a
 * single launch-time constant:
 *
 * - override (NOCETTA_ROOT / --root) → that root for everything, path unchanged;
 * - anchored (an artifactPath): walk up from the artifact's own location
 *   (resolveRootFromArtifact), and record the path relative to that store;
 * - unanchored / default (no path hint): the client's advertised roots — one
 *   root wins, several collapse to the single `.git`/`.nocetta` one or else
 *   refuse as ambiguous; no roots capability falls back to discovery from base.
 *
 * Every resolved root passes the bare-multi-repo-parent guard before use, so a
 * write can never silently fragment memory into `<parent>/.nocetta`.
 *
 * Facades are cached per root — one `open()` (one store read) per project the
 * server touches, reused across calls; each facade reloads itself on mutation.
 */
export declare class StoreRouter {
    private readonly base;
    private readonly override?;
    private readonly listRoots?;
    private readonly openStore;
    private readonly cache;
    constructor(opts?: StoreRouterOptions);
    private facadeFor;
    /**
     * Refuse a root that is a bare directory holding child project repos — the
     * exact shape that planted a shared store at the parent. The override is
     * exempt: an explicit root is a deliberate choice, honoured verbatim.
     */
    private guard;
    /** The facade for an anchored write/read, resolved from the artifact it names
     * and with the artifactPath rewritten relative to the resolved store. */
    forArtifact(artifactPath: string): {
        nc: Nocetta;
        artifactPath: string;
    };
    /** The facade for a files_in_play read: routed by the first path (anchors in
     * other projects' stores wouldn't match anyway), with every path rewritten
     * relative to that store so the reverse index can match them. */
    forFiles(files: string[]): {
        nc: Nocetta;
        files: string[];
    };
    /** The facade for an unanchored write or any path-less tool (keyword search,
     * worklist, supersede, repair, as_of). */
    forDefault(): Promise<{
        nc: Nocetta;
    }>;
    private resolveDefaultRoot;
}
/** A `listRoots` closure over an MCP server: returns the client's advertised
 * roots as filesystem paths, or an empty list when the client doesn't support
 * the capability — so the router falls back to discovery rather than erroring. */
export declare function clientRootsFrom(server: {
    getClientCapabilities(): {
        roots?: unknown;
    } | undefined;
    listRoots(): Promise<{
        roots: {
            uri: string;
        }[];
    }>;
}): () => Promise<string[]>;
