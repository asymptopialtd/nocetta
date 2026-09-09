import type { SymbolLocator } from "../anchor/locator.js";
import { check } from "../drift/check.js";
import type { RepoState } from "../drift/repo-state.js";
import type { MemoryNode } from "../store/types.js";
import type { Candidate, RankedCandidate } from "./types.js";

/** Stage 1: candidate-gen via the anchor reverse-index — any node with at
 * least one anchor into the given file set. (keyword.ts's candidatesFromKeyword
 * is the second candidate-gen source, Slice 6 — same downstream stages.) */
export function candidatesFromFiles(nodes: MemoryNode[], filesInPlay: readonly string[]): Candidate[] {
  const fileSet = new Set(filesInPlay);
  const candidates: Candidate[] = [];
  for (const node of nodes) {
    const matchedFiles = new Set(node.anchors.map((a) => a.artifactPath).filter((p) => fileSet.has(p)));
    if (matchedFiles.size > 0) candidates.push({ node, matchedFiles });
  }
  return candidates;
}

function walkToTip(node: MemoryNode, byId: ReadonlyMap<string, MemoryNode>): MemoryNode {
  let current = node;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(current.id)) return current; // cycle guard; DAG invariant should prevent this
    seen.add(current.id);
    const edge = current.edges.find((e) => e.type === "superseded-by");
    if (!edge) return current;
    const next = byId.get(edge.target);
    if (!next) return current; // dangling edge: honest stay rather than guess
    current = next;
  }
}

/** Stage 2: resolve every candidate forward to its supersession tip, merging
 * (union of matchedFiles, max of keywordScore) any candidates that collapse
 * onto the same tip. This is what drops superseded nodes from ever being a
 * final result — a superseded candidate is always replaced by its tip,
 * never returned as-is. */
export function resolveToTip(candidates: Candidate[], byId: ReadonlyMap<string, MemoryNode>): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const tip = walkToTip(candidate.node, byId);
    const existing = merged.get(tip.id);
    if (existing) {
      for (const f of candidate.matchedFiles) existing.matchedFiles.add(f);
      if (candidate.keywordScore !== undefined) {
        existing.keywordScore = Math.max(existing.keywordScore ?? 0, candidate.keywordScore);
      }
    } else {
      merged.set(tip.id, { node: tip, matchedFiles: new Set(candidate.matchedFiles), keywordScore: candidate.keywordScore });
    }
  }
  return [...merged.values()];
}

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
export function filterLive(candidates: Candidate[], opts: FilterLiveOptions): Candidate[] {
  const dirty = check(opts.nodes, opts.repoState, opts.locator).dirty;
  const now = opts.now ?? new Date().toISOString();
  return candidates.filter(({ node }) => {
    if (dirty.has(node.id)) return false;
    if (opts.scope && node.scope !== opts.scope && node.scope !== "global") return false;
    if (node.validFrom > now) return false;
    if (node.validTo !== null && node.validTo <= now) return false;
    return true;
  });
}

const DAY_MS = 1000 * 60 * 60 * 24;

/** Stage 4: rank — anchor-match count dominates (this is anchor-driven
 * retrieval), BM25 keyword score adds a secondary signal (bounded well
 * below one anchor match), recency breaks remaining ties without ever
 * outweighing either. */
export function rankCandidates(candidates: Candidate[], now: string = new Date().toISOString()): RankedCandidate[] {
  const nowMs = new Date(now).getTime();
  return candidates
    .map((c) => {
      const ageMs = Math.max(0, nowMs - new Date(c.node.txnTime).getTime());
      const recency = 1 / (1 + ageMs / DAY_MS);
      return { ...c, score: c.matchedFiles.size * 10 + (c.keywordScore ?? 0) + recency };
    })
    .sort((a, b) => b.score - a.score);
}

export interface BudgetOptions {
  maxResults?: number;
  maxBodyChars?: number;
}

/** The one-line label a body gets excerpted or replaced down to: the node's
 * own summary when it has one (every node written since the summary field
 * landed does), else the first line of the body — never nothing. */
function previewLabel(node: MemoryNode): string {
  return node.summary?.trim() || (node.body.trim().split("\n", 1)[0] ?? "").trim() || "(no summary)";
}

/** A node whose body alone blows the whole budget: never dropped, but its
 * body is replaced by the preview label plus a marker naming how much prose
 * is being held back — precision over silence (decision 81b95760). */
function excerptToSummary(node: MemoryNode): MemoryNode {
  const chars = node.body.length;
  return { ...node, body: `${previewLabel(node)} … [body truncated, ${chars} chars — search this node's anchor to read in full]` };
}

/** A node ranked below the spent budget: still returned, body collapsed to
 * just the preview label — a precise miss beats vanishing from the page. */
function toSummaryOnly(node: MemoryNode): RankedCandidate["node"] {
  return { ...node, body: previewLabel(node) };
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
export function applyBudget(ranked: RankedCandidate[], opts: BudgetOptions = {}): RankedCandidate[] {
  const maxResults = opts.maxResults ?? Infinity;
  const maxBodyChars = opts.maxBodyChars ?? Infinity;
  const out: RankedCandidate[] = [];
  let used = 0;
  let budgetSpent = false;

  for (const candidate of ranked) {
    if (out.length >= maxResults) break;
    const cost = candidate.node.body.length;

    if (!budgetSpent && cost > maxBodyChars) {
      out.push({ ...candidate, node: excerptToSummary(candidate.node) });
      budgetSpent = true; // this one alone already spent the whole budget
      continue;
    }
    if (!budgetSpent && out.length > 0 && used + cost > maxBodyChars) {
      budgetSpent = true;
    }
    if (budgetSpent) {
      out.push({ ...candidate, node: toSummaryOnly(candidate.node) });
      continue;
    }
    used += cost;
    out.push(candidate);
  }
  return out;
}
