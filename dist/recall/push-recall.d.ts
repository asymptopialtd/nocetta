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
     * used, so it is suppressed permanently (for this session, until a
     * compaction marker resets the window — see user-prompt-submit-hook.ts). */
    acked: boolean;
    /** True when the prior injection came from an anchor match, not a keyword
     * hit. An anchor surfaced the memory precisely once already, so a repeat
     * anchor is suppressed — but a prior keyword injection (possibly a false
     * positive the agent ignored) never mutes a later anchor match. */
    viaAnchor: boolean;
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
    /** How this pick was found — recorded on the inject event so a later turn's
     * dedup knows whether an anchor already surfaced it (suppress) or only a
     * keyword did (an anchor may still override). */
    viaAnchor: boolean;
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
export declare const RISING_BAR_MARGIN = 4;
/**
 * Pick at most one node to push, or null — silence is the resting state.
 * `candidates` is expected to already be current-only (filterLive, inherited
 * from rankedSearch) and anything above it happens purely on score/anchor
 * shape; this function trusts, and never re-derives, that staleness filter.
 */
export declare function selectPushRecall(candidates: readonly RankedCandidate[], priorInjections: readonly PriorInjection[], opts: PushRecallOptions): PushRecallPick | null;
