import { significantTokens } from "../text/tokens.js";
import { directlyRelated } from "./conflicts.js";
/**
 * Calibrated on the double-onboarding dogfood (lootbox-sim, 2026-09-09): an
 * onboarding prompt run twice on a seeded store re-captured ~11 beliefs with
 * fresh wording, and every copy stayed live — nothing in the loop spoke up.
 * On that store's 31 nodes the rule below fires on all 10 unambiguous
 * duplicate pairs (plus one stale-doc marker vs its live replacement, a pair
 * that genuinely wants the nudge) and on nothing else; the clean nocetta
 * self-store fires zero. A deliberately-accepted miss: a coarse entity later
 * re-captured as a broader naming-legacy entity scores 0.15 — related, not
 * the same belief, and precision-over-recall holds here as in conflicts.
 * - ANCHORED: both cite the same locator — the locator is the subject, only
 *   the overlap has to clear a low bar (dups ≥ 0.53, same-heading siblings
 *   that are distinct invariants ≤ 0.29).
 * - CROSS: no shared locator — one lane above it (re-captures ≥ 0.45,
 *   unrelated pairs ≤ 0.43).
 */
const ANCHORED_THRESHOLD = 0.4;
const CROSS_THRESHOLD = 0.44;
/**
 * A word carried by more than half the parties — or by only the pair — uses
 * conflicts.ts's own discipline: a shared word that names the domain (every
 * belief in a store says "memory") is not evidence; one shared by just the
 * pair always is. The "Nocetta" entity (body: one word, carried by every
 * decision) is the degenerate case this gate exists for: containment 1.0
 * against everything, subject evidence zero.
 */
const AMBIENT_DF_RATIO = 0.5;
/** idf-mass containment: how much of the smaller token set's weight also
 * appears in the larger. Weighted (not raw counts) so the discriminative
 * tokens decide and the ambient normative vocabulary ("belief", "capture")
 * doesn't carry a pair over the line. */
function containment(a, b, idf) {
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    let intersection = 0;
    let minSide = 0;
    for (const token of small) {
        const weight = idf.get(token) ?? 0;
        minSide += weight;
        if (big.has(token))
            intersection += weight;
    }
    return minSide > 0 ? intersection / minSide : 0;
}
function dfOver(tokenSets) {
    const df = new Map();
    for (const set of tokenSets) {
        for (const token of set)
            df.set(token, (df.get(token) ?? 0) + 1);
    }
    return df;
}
function idfFromDf(df, total) {
    const idf = new Map();
    for (const [token, count] of df)
        idf.set(token, Math.log(1 + total / count));
    return idf;
}
/**
 * Surface (never auto-resolve) pairs of live beliefs that say the same
 * thing. Convergence stays the caller's move — memory_supersede one side,
 * keeping the better-anchored/worded copy as the tip — because a false
 * positive must never destroy information, the same reason conflicts are
 * advisory. Superseded nodes are dead and skipped outright; pairs already
 * related by a supersession/restatement edge are the resolution working,
 * not a problem. O(n²) over the live set with token sets built once — fine
 * at store scale (hundreds), the same trade findConflicts makes.
 */
export function findDuplicates(nodes) {
    const live = nodes.filter((n) => !n.edges.some((e) => e.type === "superseded-by"));
    // Two tokenizations: summaries alone are the distilled beliefs and catch
    // pairs whose bodies diverge in detail; summary+body catches pairs whose
    // summaries went different words on one fact. The score is the better of
    // the two (dogfood: the pity pair only clears on summaries, the rebrand
    // pair only on bodies). idf is per-tokenization over the live set.
    const full = live.map((n) => significantTokens(`${n.summary ?? ""}\n${n.body}`));
    const headline = live.map((n) => (n.summary === undefined ? null : significantTokens(n.summary)));
    const fullDf = dfOver(full);
    const fullIdf = idfFromDf(fullDf, live.length);
    const headlineSets = headline.filter((s) => s !== null);
    const headlineIdf = idfFromDf(dfOver(headlineSets), headlineSets.length);
    // Ambient vocabulary from the full tokenization — the same max(2, …) floor
    // as conflicts: a word shared by only the pair always counts.
    const ambientAbove = Math.max(2, live.length * AMBIENT_DF_RATIO);
    const duplicates = [];
    for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
            const a = live[i];
            const b = live[j];
            if (directlyRelated(a, b))
                continue;
            let discriminating = false;
            for (const token of full[i]) {
                if (full[j].has(token) && (fullDf.get(token) ?? 0) <= ambientAbove) {
                    discriminating = true;
                    break;
                }
            }
            if (!discriminating)
                continue;
            const sharedAnchors = a.anchors
                .filter((x) => b.anchors.some((y) => y.locator === x.locator))
                .map((x) => x.locator);
            const score = Math.max(containment(full[i], full[j], fullIdf), headline[i] !== null && headline[j] !== null
                ? containment(headline[i], headline[j], headlineIdf)
                : 0);
            const threshold = sharedAnchors.length > 0 ? ANCHORED_THRESHOLD : CROSS_THRESHOLD;
            if (score >= threshold)
                duplicates.push({ a, b, score, sharedAnchors });
        }
    }
    return duplicates.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id));
}
