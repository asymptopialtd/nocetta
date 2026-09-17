function tally(events) {
    const surfaced = new Map();
    const cited = new Map();
    for (const event of events) {
        const target = event.kind === "recall" ? surfaced : cited;
        for (const id of event.ids)
            target.set(id, (target.get(id) ?? 0) + 1);
    }
    return { surfaced, cited };
}
/**
 * Fold the recall log over the current node set into the four buckets. Pure:
 * `classOf` is injected so the artifact-reading classifier stays out of the
 * fold (the CLI wires the real one; tests stub it). `nodes` should already be
 * the current view — dead beliefs are not part of a live value picture.
 */
export function buildLedger(nodes, events, classOf) {
    const { surfaced, cited } = tally(events);
    const ledger = { working: [], redundant: [], dormant: [], prunable: [] };
    for (const node of nodes) {
        const seen = surfaced.get(node.id) ?? 0;
        const klass = classOf(node);
        const entry = {
            id: node.id,
            summary: node.summary ?? node.body.split("\n")[0].slice(0, 80),
            klass,
            surfaced: seen,
            cited: cited.get(node.id) ?? 0,
        };
        const complement = klass === "complement";
        const bucket = seen > 0 ? (complement ? ledger.working : ledger.redundant) : complement ? ledger.dormant : ledger.prunable;
        bucket.push(entry);
    }
    for (const key of ["working", "redundant", "dormant", "prunable"]) {
        ledger[key].sort((a, b) => b.cited - a.cited || b.surfaced - a.surfaced || a.id.localeCompare(b.id));
    }
    return ledger;
}
