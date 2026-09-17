import { resolveAnchor } from "../anchor/resolve.js";
import { findConflicts } from "../supersede/conflicts.js";
import { findDuplicates } from "../supersede/duplicates.js";
import { supersede } from "../supersede/supersede.js";
import { writeNode } from "../store/store.js";
import { createNode } from "./create.js";
/**
 * Validate up front and narrow the request to an anchor target, so the rest
 * of remember() can assume every violation already threw. A bare artifactPath
 * also refuses: it would quietly anchor nothing, which is the unanchored-guess
 * shape capture exists to prevent.
 */
function anchorTarget(req) {
    if (req.body.trim().length === 0)
        throw new Error("remember: body must be non-empty");
    const { symbolName, heading, artifactPath } = req;
    if (req.kind === "entity" && (symbolName !== undefined || heading !== undefined || artifactPath !== undefined)) {
        throw new Error("remember: entity nodes are unanchored — drop symbolName/heading/artifactPath");
    }
    if (symbolName !== undefined && heading !== undefined) {
        throw new Error("remember: symbolName and heading are mutually exclusive — one anchor target per node");
    }
    if (symbolName !== undefined) {
        if (artifactPath === undefined) {
            throw new Error("remember: artifactPath is required when symbolName is given");
        }
        return { strategy: "code", artifactPath, symbolName };
    }
    if (heading !== undefined) {
        if (artifactPath === undefined) {
            throw new Error("remember: artifactPath is required when heading is given");
        }
        return { strategy: "content", artifactPath, heading };
    }
    if (artifactPath !== undefined) {
        throw new Error(`remember: artifactPath "${artifactPath}" anchors nothing without symbolName or heading — give one or drop the path`);
    }
    return null;
}
function warningFor(conflict, newId) {
    const mine = conflict.invariantNode.id === newId ? conflict.invariantNode : conflict.defaultNode;
    const other = conflict.invariantNode.id === newId ? conflict.defaultNode : conflict.invariantNode;
    return `conflict advisory: "${newId}" (${mine.authority}) vs "${other.id}" (${other.authority}) on subject "${conflict.subject}" — both kept, nothing auto-resolved`;
}
function duplicateWarningFor(duplicate, newId) {
    const other = duplicate.a.id === newId ? duplicate.b : duplicate.a;
    const preview = other.summary ?? other.body.replace(/\s+/g, " ");
    return (`duplicate advisory: the store already holds a belief that says this — "${other.id}" ` +
        `(${Math.round(duplicate.score * 100)}% overlap) "${preview.slice(0, 60)}" — ` +
        "if it states the same belief, supersede it (memory_supersede, keeping the better-anchored copy) or drop this write; if genuinely distinct, keep both");
}
/**
 * Capture: validate → resolve the anchor against the artifact's real source →
 * build via createNode → supersede in memory → collect conflict and duplicate
 * advisories → persist through the writeNode choke-point. The never-leak gate
 * stays inside writeNode (nothing here re-implements or bypasses it);
 * advisories are advisory only — they come back as `warnings` and never block
 * a write.
 * Resolution is the shared exact-match machinery (anchor/resolve.ts) called
 * in capture's own voice, so repair can never resolve where capture refuses.
 */
export function remember(memoryDir, nodes, req, opts = {}) {
    const target = anchorTarget(req);
    const node = createNode({
        body: req.body,
        kind: req.kind,
        scope: req.scope ?? "global",
        authority: req.authority ?? "default",
        anchors: target ? [resolveAnchor(target, { ...opts, verb: "remember" })] : [],
        // Omitted (not `summary: undefined`) so createNode's own derived
        // fallback applies — an explicit `summary: undefined` key would spread
        // over that default instead of falling through to it.
        ...(req.summary !== undefined ? { summary: req.summary } : {}),
        ...(req.commit !== undefined ? { commit: req.commit } : {}),
        // createNode's clock is real time; a deterministic one rides the same
        // explicit-values-win path.
        ...(opts.now !== undefined ? { validFrom: opts.now, txnTime: opts.now } : {}),
    });
    let finalNode = node;
    let superseded = null;
    if (req.supersedes !== undefined) {
        const result = supersede(nodes, req.supersedes, node, { now: opts.now });
        superseded = result.old;
        finalNode = result.next;
    }
    const warnings = [
        ...findConflicts([...nodes, finalNode])
            .filter((c) => c.invariantNode.id === finalNode.id || c.defaultNode.id === finalNode.id)
            .map((c) => warningFor(c, finalNode.id)),
        // A duplicate advisory is the convergence nudge: the store already holds
        // this belief (the double-onboarding failure mode), and the agent is
        // reading this at the exact moment the cheaper move — supersede, don't
        // accrete — is still available. The node this write already supersedes
        // is the resolution, not a duplicate.
        ...findDuplicates([...nodes, finalNode])
            .filter((d) => d.a.id === finalNode.id || d.b.id === finalNode.id)
            .filter((d) => req.supersedes === undefined || (d.a.id !== req.supersedes && d.b.id !== req.supersedes))
            .map((d) => duplicateWarningFor(d, finalNode.id)),
    ];
    // The new node lands first: if the gate refuses it, the old fact stands
    // untouched — a supersession never tears.
    writeNode(memoryDir, finalNode);
    if (superseded)
        writeNode(memoryDir, superseded);
    return { node: finalNode, superseded, warnings };
}
