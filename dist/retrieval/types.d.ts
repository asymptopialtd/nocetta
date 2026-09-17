import type { MemoryNode } from "../store/types.js";
/** A candidate carries which of the queried files it matched via an anchor
 * (Slice 4) and/or a keyword relevance score (Slice 6), even after it's
 * been resolved to a (possibly anchor-less) tip node. */
export interface Candidate {
    node: MemoryNode;
    matchedFiles: Set<string>;
    keywordScore?: number;
}
export interface RankedCandidate extends Candidate {
    score: number;
}
export interface SearchResult {
    node: MemoryNode;
    score: number;
}
export interface SearchQuery {
    filesInPlay: string[];
    /** Free-text keyword query; feeds the BM25 candidate-gen alongside the
     * anchor reverse-index. */
    keyword?: string;
    scope?: string;
    /** ISO timestamp; defaults to now. Exposed for deterministic tests. */
    now?: string;
    maxResults?: number;
    /** Token-budget proxy: total body characters admitted. */
    maxBodyChars?: number;
}
