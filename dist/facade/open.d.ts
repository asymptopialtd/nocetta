import type { SymbolLocator } from "../anchor/locator.js";
import type { RememberRequest } from "../capture/remember.js";
import type { RepoState } from "../drift/repo-state.js";
import type { SearchQuery, SearchResult } from "../retrieval/types.js";
import type { ReAnchorRequest } from "../repair/re-anchor.js";
import type { Conflict } from "../supersede/conflicts.js";
import type { Duplicate } from "../supersede/duplicates.js";
import type { SupersedeOptions } from "../supersede/supersede.js";
import type { StoreIssue } from "../store/store.js";
import type { MemoryNode } from "../store/types.js";
/** Canonical store layout: every memory lives in `<repoRoot>/.nocetta/memory`. */
export declare const MEMORY_DIR = ".nocetta/memory";
export interface OpenOptions {
    /** Injected code parser; defaults to nocetta's built-in tree-sitter locator.
     * Threads into search/contextTrigger and the worklist's drift check. */
    locator?: SymbolLocator;
}
/**
 * One "what needs attention" surface: drift (reason verbatim), cross-authority
 * conflicts, and duplicate pairs. It reports; it does not repair — the
 * facade's reAnchor/retire/supersede are the actions that close what this
 * list opens.
 */
export interface Worklist {
    dirty: {
        node: MemoryNode;
        reason: string;
    }[];
    conflicts: Conflict[];
    /** Live beliefs that say the same thing — the accretion a warning-ignoring
     * capture leaves behind. Converged by superseding one side. */
    duplicates: Duplicate[];
}
/**
 * The whole loop behind one object. The engine's functions stay pure
 * `(nodes[], repoState, ...)`; this is the stateful shell a host actually
 * holds — capture → recall → drift → repair in a single handle, with the
 * store location derived from repoRoot instead of threaded through every call.
 */
export interface Nocetta {
    readonly repoRoot: string;
    /** Re-read the store from disk. Explicit by design — no file watchers. */
    reload(): void;
    /** The current in-memory node set — a rebuildable fold over the files. */
    nodes(): MemoryNode[];
    /** The quarantine report from the last read: hand-broken store files that
     * were skipped (with a reason), never deleted — files are truth, the report
     * is advice. Refreshed by reload() and by every mutation (which reloads). */
    issues(): StoreIssue[];
    search(q: SearchQuery): SearchResult[];
    contextTrigger(files: string[], opts?: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars">): SearchResult[];
    remember(req: RememberRequest): {
        node: MemoryNode;
        superseded: MemoryNode | null;
        warnings: string[];
        file: string;
    };
    supersede(oldId: string, next: MemoryNode, opts?: SupersedeOptions): {
        old: MemoryNode;
        next: MemoryNode;
    };
    override(oldId: string, next: MemoryNode, reason: string, opts?: SupersedeOptions): {
        old: MemoryNode;
        next: MemoryNode;
    };
    worklist(opts?: {
        now?: string;
    }): Worklist;
    /** Identity repair, in place: the node's matching anchor is re-resolved
     * against the artifact's current source (the same exact-match machinery as
     * remember) and its locator+hash rewritten. Body and valid-time window are
     * untouched — the belief didn't change. */
    reAnchor(nodeId: string, req: ReAnchorRequest): MemoryNode;
    /** Close the node's valid-time window (validTo = now) and record the
     * mandatory reason. Not a supersession: the node simply leaves "current"
     * and stays visible to asOf. */
    retire(nodeId: string, reason: string): MemoryNode;
    asOf(atTxnTime: string): MemoryNode[];
}
/**
 * The loader that kills the forgotten-file error class: it reads exactly the
 * anchored artifactPath set — never a repo walk (unanchored files would fake
 * coverage), never a hand-assembled list (a forgotten entry hides stale dirt).
 * An artifact that doesn't exist stays absent from the map, so check()
 * reports "artifact missing" instead of the loader substituting a guess.
 */
export declare function loadRepoState(repoRoot: string, nodes: readonly MemoryNode[]): RepoState;
/**
 * Read the store once and hand back the loop. Queries rebuild their repo
 * state per call from the anchored set (caching is Seam 10 and stays unbuilt
 * until measured); mutations persist through the engine's own functions —
 * writeNode remains the only writer — and then the cache is rebuilt from
 * disk rather than patched in place: one code path maintains the fold, so
 * the in-memory set cannot disagree with what was actually persisted.
 */
export declare function open(repoRoot: string, opts?: OpenOptions): Nocetta;
