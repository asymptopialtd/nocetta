import type { SupersedeOptions } from "../supersede/supersede.js";
import type { MemoryNode } from "../store/types.js";
/**
 * Every non-entity memory node whose body mentions the entity by canonical
 * name or alias (exact word-boundary match; embeddings would extend this to
 * inferred/lower-confidence references — out of scope for the spike). Other
 * `entity` nodes (e.g. an old revision of this same entity, kept around by
 * supersession) are never "references" in the interesting sense, so they're
 * excluded regardless of whether their body text happens to match.
 */
export declare function findReferences(nodes: MemoryNode[], entityId: string): MemoryNode[];
/** The canonical entity node for a name or alias, resolved to its
 * supersession tip (a renamed entity is superseded, not mutated in place). */
export declare function goToDefinition(nodes: MemoryNode[], nameOrAlias: string): MemoryNode | undefined;
/**
 * rename-entity ~= rename-symbol: implemented as a supersession, not a
 * mutation — the old entity is edged forward, never deleted, so every
 * existing reference to the old name still resolves (the old canonical
 * name and the old node's own aliases are folded into the new node's alias
 * set, so findReferences/goToDefinition keep working under the old name).
 */
export declare function renameEntity(nodes: readonly MemoryNode[], entityId: string, next: MemoryNode, opts?: SupersedeOptions): {
    old: MemoryNode;
    next: MemoryNode;
};
