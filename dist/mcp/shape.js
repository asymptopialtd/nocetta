export function shapeNode(node) {
    return {
        id: node.id,
        kind: node.kind,
        authority: node.authority,
        scope: node.scope,
        anchor: node.anchors.map((a) => a.locator),
        ...(node.retiredReason ? { retiredReason: node.retiredReason } : {}),
        ...(node.summary ? { summary: node.summary } : {}),
        ...(node.commit ? { commit: node.commit } : {}),
        body: node.body,
    };
}
export function shapeBelief(node) {
    return { ...shapeNode(node), validFrom: node.validFrom, validTo: node.validTo };
}
export function shapeHit(result) {
    return { ...shapeNode(result.node), score: Number(result.score.toFixed(3)) };
}
/** One JSON object per line: an agent reads a result list without a parser
 * and can quote a single line back verbatim. */
export function shapeLines(shaped) {
    return shaped.map((item) => JSON.stringify(item)).join("\n");
}
/**
 * The worklist in one object. Dirty nodes carry their reason verbatim and the
 * artifactPath a repair request needs; the repair pointer travels with the
 * data (only when there is something to repair) so the worklist teaches its
 * own next action instead of dead-ending, which is how check() lost the loop.
 */
export function shapeWorklist(worklist, issues) {
    return JSON.stringify({
        dirty: worklist.dirty.map(({ node, reason }) => ({
            id: node.id,
            kind: node.kind,
            reason,
            artifactPath: node.anchors[0]?.artifactPath ?? null,
            anchor: node.anchors.map((a) => a.locator),
            body: node.body,
        })),
        conflicts: worklist.conflicts.map((c) => ({
            subject: c.subject,
            invariant: c.invariantNode.id,
            default: c.defaultNode.id,
        })),
        duplicates: worklist.duplicates.map((d) => ({
            a: d.a.id,
            b: d.b.id,
            score: Number(d.score.toFixed(2)),
            summaryA: d.a.summary,
            summaryB: d.b.summary,
        })),
        issues: issues.map((issue) => ({ file: issue.file, reason: issue.reason })),
        ...(worklist.dirty.length > 0
            ? {
                repair: 're-anchor a dirty node with memory_repair (action: "reanchor", giving symbol or heading); retire it there (action: "retire") if the belief is simply gone',
            }
            : {}),
        ...(worklist.duplicates.length > 0
            ? {
                converge: "converge a duplicate pair with memory_supersede — write the better-anchored/worded belief as the tip over the weaker id; the superseded belief stays in history",
            }
            : {}),
    });
}
