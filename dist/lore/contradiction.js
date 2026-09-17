import { STOPWORDS, tokenize } from "../text/tokens.js";
import { findReferences } from "./entity.js";
const NEGATION_WORDS = ["not", "no longer", "never", "isn't", "aren't", "doesn't", "didn't"];
function hasNegation(text) {
    const lower = text.toLowerCase();
    return NEGATION_WORDS.some((w) => lower.includes(w));
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
export class HeuristicContradictionFlagger {
    flag(existingFacts, newFact) {
        const newTokens = new Set(tokenize(newFact.body));
        const newNegated = hasNegation(newFact.body);
        const suggestions = [];
        for (const fact of existingFacts) {
            if (fact.id === newFact.id)
                continue;
            const shared = tokenize(fact.body).find((t) => newTokens.has(t) && !STOPWORDS.has(t));
            if (!shared)
                continue;
            if (hasNegation(fact.body) !== newNegated) {
                suggestions.push({ factId: fact.id, reason: `shares "${shared}" with the new fact but negation disagrees` });
            }
        }
        return suggestions;
    }
}
/**
 * Write-path consistency check: retrieve the entity's live fact-set (every
 * non-entity node that references it by name/alias and isn't already
 * superseded) and ask the flagger for suggestions against a candidate new
 * fact. Deliberately *not* wired into store.writeNode — the write path
 * stays LLM-free (no LLM in the correctness path); this is meant to be
 * called by the caller/agent around a write, as advice, never as a gate.
 */
export function checkConsistency(nodes, entityId, newFact, flagger) {
    const liveFacts = findReferences(nodes, entityId).filter((n) => !n.edges.some((e) => e.type === "superseded-by"));
    return flagger.flag(liveFacts, newFact);
}
