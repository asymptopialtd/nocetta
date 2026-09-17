import { resolveToTip } from "../retrieval/pipeline.js";
import { supersede } from "../supersede/supersede.js";
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** An entity's canonical name is its body; aliases are the extra names. */
function namesOf(entity) {
    return [entity.body, ...(entity.aliases ?? [])];
}
function matchesName(entity, nameOrAlias) {
    return namesOf(entity).some((n) => n.toLowerCase() === nameOrAlias.toLowerCase());
}
/**
 * Every non-entity memory node whose body mentions the entity by canonical
 * name or alias (exact word-boundary match; embeddings would extend this to
 * inferred/lower-confidence references — out of scope for the spike). Other
 * `entity` nodes (e.g. an old revision of this same entity, kept around by
 * supersession) are never "references" in the interesting sense, so they're
 * excluded regardless of whether their body text happens to match.
 */
export function findReferences(nodes, entityId) {
    const entity = nodes.find((n) => n.id === entityId);
    if (!entity || entity.kind !== "entity")
        throw new Error(`findReferences: unknown entity "${entityId}"`);
    const patterns = namesOf(entity).map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i"));
    return nodes.filter((n) => n.kind !== "entity" && patterns.some((p) => p.test(n.body)));
}
/** The canonical entity node for a name or alias, resolved to its
 * supersession tip (a renamed entity is superseded, not mutated in place). */
export function goToDefinition(nodes, nameOrAlias) {
    const entity = nodes.find((n) => n.kind === "entity" && matchesName(n, nameOrAlias));
    if (!entity)
        return undefined;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const [resolved] = resolveToTip([{ node: entity, matchedFiles: new Set() }], byId);
    return resolved.node;
}
/**
 * rename-entity ~= rename-symbol: implemented as a supersession, not a
 * mutation — the old entity is edged forward, never deleted, so every
 * existing reference to the old name still resolves (the old canonical
 * name and the old node's own aliases are folded into the new node's alias
 * set, so findReferences/goToDefinition keep working under the old name).
 */
export function renameEntity(nodes, entityId, next, opts = {}) {
    const old = nodes.find((n) => n.id === entityId);
    if (!old)
        throw new Error(`renameEntity: unknown node "${entityId}"`);
    if (old.kind !== "entity")
        throw new Error(`renameEntity: "${entityId}" is not an entity`);
    const carriedOverAliases = [old.body, ...(old.aliases ?? [])];
    const withAliases = {
        ...next,
        kind: "entity",
        aliases: [...new Set([...(next.aliases ?? []), ...carriedOverAliases])],
    };
    return supersede(nodes, entityId, withAliases, opts);
}
