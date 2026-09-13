import type { SymbolLocator } from "../anchor/locator.js";
import type { RepoState } from "../drift/repo-state.js";
import type { MemoryNode } from "../store/types.js";
import { candidatesFromKeyword } from "./keyword.js";
import { applyBudget, candidatesFromFiles, filterLive, rankCandidates, resolveToTip } from "./pipeline.js";
import type { RankedCandidate, SearchQuery, SearchResult } from "./types.js";

/** Stages 1-4 given a query, stopping short of applyBudget: the ranked
 * candidates still carry matchedFiles (which node in play), so a caller that
 * needs more than "node + score" — push-recall's anchor-vs-keyword guardrail
 * (rule 3 of selectPushRecall) is the reason this exists — reads it straight
 * off the candidate instead of re-deriving it. searchMemory is this plus the
 * budget stage; keep both on the same pipeline rather than duplicating it. */
export function rankedSearch(nodes: MemoryNode[], repoState: RepoState, query: SearchQuery, locator?: SymbolLocator): RankedCandidate[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = [
    ...candidatesFromFiles(nodes, query.filesInPlay),
    ...(query.keyword ? candidatesFromKeyword(nodes, query.keyword) : []),
  ];
  const resolved = resolveToTip(candidates, byId);
  const live = filterLive(resolved, { scope: query.scope, now: query.now, nodes, repoState, locator });
  return rankCandidates(live, query.now);
}

/** The explicit callable: full pipeline given a query. Two candidate-gen
 * sources feed the same downstream stages: anchor reverse-index (always)
 * and BM25 keyword (when query.keyword is given). */
export function searchMemory(nodes: MemoryNode[], repoState: RepoState, query: SearchQuery, locator?: SymbolLocator): SearchResult[] {
  const ranked = rankedSearch(nodes, repoState, query, locator);
  return applyBudget(ranked, { maxResults: query.maxResults, maxBodyChars: query.maxBodyChars }).map(({ node, score }) => ({
    node,
    score,
  }));
}

/** The automatic surface: same pipeline, triggered by "these files are open
 * / in play right now" with no explicit query. */
export function contextTriggered(
  nodes: MemoryNode[],
  repoState: RepoState,
  filesInPlay: readonly string[],
  opts: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars"> = {},
  locator?: SymbolLocator,
): SearchResult[] {
  return searchMemory(nodes, repoState, { filesInPlay: [...filesInPlay], ...opts }, locator);
}
