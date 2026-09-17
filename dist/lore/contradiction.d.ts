import type { MemoryNode } from "../store/types.js";
export interface ContradictionSuggestion {
    factId: string;
    reason: string;
}
/**
 * LLM-dependent bit, kept behind an interface per PLAN.md: a real
 * implementation would ask a model to judge semantic contradiction between
 * two facts about the same entity. Never the arbiter of what is current —
 * callers get suggestions to review, nothing here writes or supersedes
 * anything on its own.
 */
export interface ContradictionFlagger {
    flag(existingFacts: MemoryNode[], newFact: MemoryNode): ContradictionSuggestion[];
}
/**
 * Deterministic stand-in for an LLM contradiction-judge, used only in tests
 * so the suite never needs a live model. Heuristic: two facts about the
 * same entity that share a significant keyword (same apparent subject) but
 * disagree on negation ("Elminster is alive" vs "Elminster is not alive
 * anymore") are flagged. This is intentionally a shallow syntactic proxy,
 * not real contradiction detection — a real flagger is exactly what would
 * replace this class.
 */
export declare class HeuristicContradictionFlagger implements ContradictionFlagger {
    flag(existingFacts: MemoryNode[], newFact: MemoryNode): ContradictionSuggestion[];
}
/**
 * Write-path consistency check: retrieve the entity's live fact-set (every
 * non-entity node that references it by name/alias and isn't already
 * superseded) and ask the flagger for suggestions against a candidate new
 * fact. Deliberately *not* wired into store.writeNode — the write path
 * stays LLM-free (no LLM in the correctness path); this is meant to be
 * called by the caller/agent around a write, as advice, never as a gate.
 */
export declare function checkConsistency(nodes: MemoryNode[], entityId: string, newFact: MemoryNode, flagger: ContradictionFlagger): ContradictionSuggestion[];
