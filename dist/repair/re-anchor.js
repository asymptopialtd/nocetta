import { resolveAnchor } from "../anchor/resolve.js";
import { writeNode } from "../store/store.js";
function repairRequest(req) {
    if (req.symbolName !== undefined && req.heading !== undefined) {
        throw new Error("reAnchor: symbolName and heading are mutually exclusive — one anchor target per request");
    }
    if (req.symbolName !== undefined)
        return { strategy: "code", symbolName: req.symbolName };
    if (req.heading !== undefined)
        return { strategy: "content", heading: req.heading };
    throw new Error("reAnchor: symbolName or heading is required — a request that names nothing would keep the stale anchor");
}
function toTarget(artifactPath, req) {
    return req.strategy === "code"
        ? { strategy: "code", artifactPath, symbolName: req.symbolName }
        : { strategy: "content", artifactPath, heading: req.heading };
}
function indexesOnArtifact(node, artifactPath) {
    const indexes = [];
    node.anchors.forEach((anchor, i) => {
        if (anchor.artifactPath === artifactPath)
            indexes.push(i);
    });
    return indexes;
}
/**
 * Pick the anchor to repair. One anchor: the request must resolve against
 * that artifact, and every refusal propagates verbatim — a symbol that is
 * gone is the agent's to fix, not to guess around. Several anchors: the
 * request itself names the artifact — it must resolve against exactly one of
 * the node's anchored artifacts, and that artifact must carry exactly one of
 * the node's anchors. Anything else refuses honestly (light 5); a silent pick
 * among candidates is how a repair mends the wrong belief.
 */
function resolveRepairTarget(node, req, opts) {
    const resolve = (artifactPath) => resolveAnchor(toTarget(artifactPath, req), { repoRoot: opts.repoRoot, readArtifact: opts.readArtifact, verb: "reAnchor" });
    if (node.anchors.length === 1) {
        return { fresh: resolve(node.anchors[0].artifactPath), index: 0 };
    }
    const artifactPaths = [...new Set(node.anchors.map((a) => a.artifactPath))];
    const hits = [];
    for (const artifactPath of artifactPaths) {
        try {
            hits.push({ fresh: resolve(artifactPath), indexes: indexesOnArtifact(node, artifactPath) });
        }
        catch {
            // this anchored artifact doesn't carry the request — one miss among
            // several candidates; the summary refusal below is the honest answer
        }
    }
    if (hits.length === 0) {
        throw new Error(`reAnchor: no anchored artifact resolves the request — "${node.id}" is anchored to: ${artifactPaths.join(", ")}`);
    }
    if (hits.length > 1) {
        const paths = hits.map((h) => h.fresh.artifactPath).join(", ");
        throw new Error(`reAnchor: the request resolves against more than one anchored artifact (${paths}) — which anchor to repair is ambiguous`);
    }
    const hit = hits[0];
    if (hit.indexes.length > 1) {
        throw new Error(`reAnchor: "${node.id}" has ${hit.indexes.length} anchors on "${hit.fresh.artifactPath}" — which anchor to repair is ambiguous`);
    }
    return { fresh: hit.fresh, index: hit.indexes[0] };
}
/**
 * Identity repair, in place (Seam 4): the anchor's locator + hash are
 * re-resolved against the artifact's current source and rewritten; the
 * belief, its body, and its valid-time window (validFrom/validTo/txnTime)
 * are untouched — the belief didn't change, and git carries the repair
 * history. No new node, no supersession edge. Resolution rides the shared
 * extract-and-exact-match machinery, so a repair never succeeds where a
 * fresh remember of the same anchor would refuse. A superseded node refuses:
 * repair is for live nodes — supersession already owns the dead ones.
 */
export function reAnchor(memoryDir, nodes, nodeId, req, opts = {}) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node)
        throw new Error(`reAnchor: unknown node "${nodeId}"`);
    if (node.edges.some((e) => e.type === "superseded-by")) {
        throw new Error(`reAnchor: "${nodeId}" is superseded — repairing a dead node is a category error; the supersession chain already resolved it`);
    }
    if (node.anchors.length === 0) {
        throw new Error(`reAnchor: "${nodeId}" has no anchors — nothing to re-anchor`);
    }
    const { fresh, index } = resolveRepairTarget(node, repairRequest(req), opts);
    // Only locator + hash move; the artifactPath is by construction the same
    // anchor's, replaced here to make "that anchor's locator + hash" literal.
    const anchors = [...node.anchors];
    anchors[index] = { locator: fresh.locator, hash: fresh.hash, artifactPath: node.anchors[index].artifactPath };
    const repaired = { ...node, anchors };
    writeNode(memoryDir, repaired);
    return repaired;
}
