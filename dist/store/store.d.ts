import type { MemoryNode } from "./types.js";
export declare class NeverLeakError extends Error {
    readonly nodeId: string;
    readonly violations: string[];
    constructor(nodeId: string, violations: string[]);
}
/**
 * The filename is a label for humans; identity is the frontmatter id. A
 * kebab slug of the body makes `ls` and `git log --stat` on the store
 * readable; the id's first 8 chars keep names unique and traceable back to
 * the id without ever parsing frontmatter. Derived, not stored — renaming a
 * body never renames an existing file (supersession writes a new node
 * anyway), so the name is stable for a node's file's lifetime.
 */
export declare function filenameFor(node: MemoryNode): string;
/**
 * The single write choke-point for memory nodes. Every write in this codebase
 * goes through here, so cross-cutting gates — the never-leak secret gate
 * (Slice 7) chief among them — apply everywhere without touching call sites.
 *
 * The bytes land on a same-directory temp file first, then rename into place:
 * concurrent agent sessions are the norm, so a reader must never observe a
 * half-written memory file. The worst case of a mid-write crash is an orphaned
 * temp file, which reads ignore (they take .md only) and git diffs as noise.
 */
export declare function writeNode(dir: string, node: MemoryNode): void;
export interface StoreIssue {
    /** File name, not full path — e.g. "broken--abc123.md". */
    file: string;
    /** The first problem found, human-readable — e.g. `unknown kind: "decision"`. */
    reason: string;
}
/**
 * Read the whole store, quarantining what fails to parse or validate. A
 * human may be mid-edit — files are truth, the report is advice — so a bad
 * file is reported and skipped, never thrown over and never deleted or moved
 * behind their back. The good nodes always read. One issue per bad file, with
 * the first validation problem as its reason: fixing what it names surfaces
 * the rest, and the file is already open in the human's editor.
 */
export declare function readStore(dir: string): {
    nodes: MemoryNode[];
    issues: StoreIssue[];
};
/**
 * The nodes-only projection of readStore — quarantined files are skipped, not
 * thrown. Kept as the every-caller entry point so existing reads are unchanged.
 * Files are the complete source of truth.
 */
export declare function readAll(dir: string): MemoryNode[];
/**
 * Rebuildable fold: artifact path → ids of memory nodes anchored to it.
 * Never a second source of truth — always derivable from `readAll`.
 */
export declare function buildReverseIndex(nodes: MemoryNode[]): Map<string, Set<string>>;
