import type { MemoryNode } from "../store/types.js";
import type { RankedCandidate } from "../retrieval/types.js";

/**
 * Rung 4's push-recall guardrails, kept pure and separate from the CLI's I/O
 * (env vars, the recall log, stdin/stdout) — this is exactly the noise-risk
 * decision the UserPromptSubmit hook was held back until it could be proven,
 * so it needs to be exercised directly in tests, not only through a hook
 * fixture.
 *
 * Governed by the ratified invariant (memory 9e1f9c31 — [[the-claude-code-hook-lifecycle-mapped-to-nocetta]]):
 * push-recall is cooperative, never nagging or forcing. Default to silence;
 * inject at most one node; only once it clears an absolute floor; never
 * re-nag a node the agent already used, and only re-show an ignored one once
 * a materially better candidate turns up.
 */

export interface PriorInjection {
  /** Node id injected earlier this session. */
  id: string;
  /** The score it was injected at — the rising bar compares against this. */
  score: number;
  /** True when a later `ack` event in the log credited this id: it was
   * used, so it is suppressed permanently (for this session — see the
   * compaction-reset seam in user-prompt-submit-hook.ts). */
  acked: boolean;
}

export interface PushRecallOptions {
  /** NOCETTA_PUSH_FLOOR: a keyword-only candidate at or below this score
   * never injects, no matter how it ranks against the others. Anchor-gated
   * candidates (rule 3) bypass it — see selectPushRecall. */
  floor: number;
  /** Override for RISING_BAR_MARGIN; tests use this, the CLI hook doesn't. */
  risingBarMargin?: number;
}

export interface PushRecallPick {
  node: MemoryNode;
  score: number;
}

/**
 * How much a previously-ignored candidate's score must climb before it is
 * allowed to re-fire. BM25 scores here aren't normalized (keyword.ts), so
 * this is an absolute margin calibrated against this project's own score
 * spread rather than a percentage: a same-strength repeat of the same query
 * scores within a point or two of itself, while a genuinely stronger match
 * (more shared terms, a rarer term) clears it by several points. See the
 * NOCETTA_PUSH_FLOOR calibration note in README for the sampled distribution
 * this and the default floor were both read off of.
 */
export const RISING_BAR_MARGIN = 4;

/**
 * Pick at most one node to push, or null — silence is the resting state.
 * `candidates` is expected to already be current-only (filterLive, inherited
 * from rankedSearch) and anything above it happens purely on score/anchor
 * shape; this function trusts, and never re-derives, that staleness filter.
 */
export function selectPushRecall(
  candidates: readonly RankedCandidate[],
  priorInjections: readonly PriorInjection[],
  opts: PushRecallOptions,
): PushRecallPick | null {
  const margin = opts.risingBarMargin ?? RISING_BAR_MARGIN;
  const priorById = new Map(priorInjections.map((p) => [p.id, p]));

  // Rule 3: an anchor hit (a real anchor match, not a shared keyword) always
  // outranks keyword-only candidates and bypasses both the floor and the
  // session dedup below — it's direct evidence, not BM25's "score > 0 on one
  // common word" the floor exists to guard against.
  const anchored = candidates.filter((c) => c.matchedFiles.size > 0);
  if (anchored.length > 0) return top(anchored);

  const eligible = candidates.filter((c) => {
    if (c.score <= opts.floor) return false; // rule 1: default to silence
    const prior = priorById.get(c.node.id);
    if (!prior) return true; // never shown this session — free to fire
    if (prior.acked) return false; // used already — consumed, not repeated
    return c.score > prior.score + margin; // ignored before — needs the rising bar
  });
  return eligible.length > 0 ? top(eligible) : null;
}

/** Highest-scoring candidate. A plain reduce rather than trusting the
 * caller's array to already be sorted (rankedSearch's output is, but this
 * function is unit-tested with hand-built arrays that needn't be). */
function top(candidates: readonly RankedCandidate[]): PushRecallPick {
  let best = candidates[0]!;
  for (const c of candidates) if (c.score > best.score) best = c;
  return { node: best.node, score: best.score };
}
