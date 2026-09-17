import type { SymbolLocator } from "../anchor/locator.js";
import type { RepoState } from "../drift/repo-state.js";
import type { MemoryNode } from "../store/types.js";
import type { RankedCandidate, SearchQuery, SearchResult } from "./types.js";
/** Stages 1-4 given a query, stopping short of applyBudget: the ranked
 * candidates still carry matchedFiles (which node in play), so a caller that
 * needs more than "node + score" — push-recall's anchor-vs-keyword guardrail
 * (rule 3 of selectPushRecall) is the reason this exists — reads it straight
 * off the candidate instead of re-deriving it. searchMemory is this plus the
 * budget stage; keep both on the same pipeline rather than duplicating it. */
export declare function rankedSearch(nodes: MemoryNode[], repoState: RepoState, query: SearchQuery, locator?: SymbolLocator): RankedCandidate[];
/** The explicit callable: full pipeline given a query. Two candidate-gen
 * sources feed the same downstream stages: anchor reverse-index (always)
 * and BM25 keyword (when query.keyword is given). */
export declare function searchMemory(nodes: MemoryNode[], repoState: RepoState, query: SearchQuery, locator?: SymbolLocator): SearchResult[];
/** The automatic surface: same pipeline, triggered by "these files are open
 * / in play right now" with no explicit query. */
export declare function contextTriggered(nodes: MemoryNode[], repoState: RepoState, filesInPlay: readonly string[], opts?: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars">, locator?: SymbolLocator): SearchResult[];
