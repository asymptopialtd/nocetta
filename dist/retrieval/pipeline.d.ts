import type { SymbolLocator } from "../anchor/locator.js";
import type { RepoState } from "../drift/repo-state.js";
import type { MemoryNode } from "../store/types.js";
import type { Candidate, RankedCandidate } from "./types.js";
/** Stage 1: candidate-gen via the anchor reverse-index — any node with at
 * least one anchor into the given file set. (keyword.ts's candidatesFromKeyword
 * is the second candidate-gen source, Slice 6 — same downstream stages.) */
export declare function candidatesFromFiles(nodes: MemoryNode[], filesInPlay: readonly string[]): Candidate[];
/** Stage 2: resolve every candidate forward to its supersession tip, merging
 * (union of matchedFiles, max of keywordScore) any candidates that collapse
 * onto the same tip. This is what drops superseded nodes from ever being a
 * final result — a superseded candidate is always replaced by its tip,
 * never returned as-is. */
export declare function resolveToTip(candidates: Candidate[], byId: ReadonlyMap<string, MemoryNode>): Candidate[];
export interface FilterLiveOptions {
    scope?: string;
    now?: string;
    /** Full node set + repo state, needed to recompute dirtiness live. */
    nodes: MemoryNode[];
    repoState: RepoState;
    /** Optional injected code parser; defaults to nocetta's built-in locator. */
    locator?: SymbolLocator;
}
/** Stage 3: scope + valid-time window + live dirtiness. A node's scope
 * matches if equal to the query scope, or if the node's scope is "global"
 * (global nodes are always in scope). Dirtiness is recomputed live (not
 * persisted) via Slice 3's check() — a node whose anchor has drifted is
 * excluded here even though its stored valid-time window hasn't (yet, that's
 * Slice 5) been closed. */
export declare function filterLive(candidates: Candidate[], opts: FilterLiveOptions): Candidate[];
/** Stage 4: rank — anchor-match count dominates (this is anchor-driven
 * retrieval), BM25 keyword score adds a secondary signal (bounded well
 * below one anchor match), recency breaks remaining ties without ever
 * outweighing either. */
export declare function rankCandidates(candidates: Candidate[], now?: string): RankedCandidate[];
export interface BudgetOptions {
    maxResults?: number;
    maxBodyChars?: number;
}
/**
 * Stage 5: top-k + token-budget cap, previewing on summaries rather than
 * dropping once the budget is spent (decision 81b95760 — structure and
 * summary-first previews are the fix for oversized recall, truncation is
 * only the safety floor). Three admission modes, in order of preference:
 *
 * 1. Full body, while the cumulative budget has room.
 * 2. A single node whose body alone exceeds the *entire* budget is still
 *    admitted — excerpted to its summary plus a truncation marker — rather
 *    than either dropped or allowed to crowd out every other result.
 * 3. Once the cumulative budget is spent, every remaining ranked result (up
 *    to maxResults) is still admitted summary-only instead of being cut —
 *    a precise miss beats a null result.
 *
 * "Always admit at least one" falls out of this for free: the first
 * candidate always lands in mode 1 or 2.
 */
export declare function applyBudget(ranked: RankedCandidate[], opts?: BudgetOptions): RankedCandidate[];
