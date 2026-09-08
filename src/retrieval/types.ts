import type { MemoryNode } from "../store/types.js";

/** A candidate carries which of the queried files it matched via an anchor,
 * even after it's been resolved to a (possibly anchor-less) tip node. */
export interface Candidate {
  node: MemoryNode;
  matchedFiles: Set<string>;
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
  scope?: string;
  /** ISO timestamp; defaults to now. Exposed for deterministic tests. */
  now?: string;
  maxResults?: number;
  /** Token-budget proxy: total body characters admitted. */
  maxBodyChars?: number;
}
