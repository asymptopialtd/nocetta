import type { RepoState } from "../drift/repo-state.js";
import type { MemoryNode } from "../store/types.js";
import { applyBudget, candidatesFromFiles, filterLive, rankCandidates, resolveToTip } from "./pipeline.js";
import type { SearchQuery, SearchResult } from "./types.js";

/** The explicit callable: full pipeline given a query. */
export function searchMemory(nodes: MemoryNode[], repoState: RepoState, query: SearchQuery): SearchResult[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = candidatesFromFiles(nodes, query.filesInPlay);
  const resolved = resolveToTip(candidates, byId);
  const live = filterLive(resolved, { scope: query.scope, now: query.now, nodes, repoState });
  const ranked = rankCandidates(live, query.now);
  return applyBudget(ranked, { maxResults: query.maxResults, maxBodyChars: query.maxBodyChars }).map(
    ({ node, score }) => ({ node, score }),
  );
}

/** The automatic surface: same pipeline, triggered by "these files are open
 * / in play right now" with no explicit query. */
export function contextTriggered(
  nodes: MemoryNode[],
  repoState: RepoState,
  filesInPlay: readonly string[],
  opts: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars"> = {},
): SearchResult[] {
  return searchMemory(nodes, repoState, { filesInPlay: [...filesInPlay], ...opts });
}
