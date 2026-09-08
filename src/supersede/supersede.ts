import type { EdgeRef, MemoryNode } from "../store/types.js";

export interface SupersedeOptions {
  /** This new node also restates an older node (walk-back provenance) — a
   * fresh node that returns to an earlier belief, never an edge back to the
   * original (the supersession relation stays acyclic). */
  restates?: string;
}

/** Would adding `fromId --superseded-by--> toId` create a cycle, i.e. is
 * `fromId` already reachable by walking forward from `toId`? */
function wouldCycle(nodes: readonly MemoryNode[], fromId: string, toId: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = byId.get(toId);
  const seen = new Set<string>();
  while (current) {
    if (current.id === fromId) return true;
    if (seen.has(current.id)) return false; // pre-existing cycle elsewhere; not this call's problem
    seen.add(current.id);
    const edge = current.edges.find((e) => e.type === "superseded-by");
    current = edge ? byId.get(edge.target) : undefined;
  }
  return false;
}

/**
 * Non-destructive supersession: `old` is never deleted, only edged forward.
 * Returns updated copies of both nodes for the caller to persist (via
 * store.writeNode) — supersede() itself does no I/O.
 *
 * - old gets `superseded-by -> next.id` (propagates authority forward).
 * - next gets `supersedes -> old.id`, and `restates -> opts.restates` if given.
 * - Guards: old must not already be superseded (fan-out is disallowed — a
 *   fact has exactly one next version); the new edge must not close a cycle
 *   (fan-in — multiple olds superseded by the same new — is fine and needs
 *   no special-casing, since each old's edge is independent).
 */
export function supersede(
  nodes: readonly MemoryNode[],
  oldId: string,
  next: MemoryNode,
  opts: SupersedeOptions = {},
): { old: MemoryNode; next: MemoryNode } {
  const old = nodes.find((n) => n.id === oldId);
  if (!old) throw new Error(`supersede: unknown node "${oldId}"`);
  if (old.edges.some((e) => e.type === "superseded-by")) {
    throw new Error(`supersede: "${oldId}" is already superseded`);
  }
  if (wouldCycle(nodes, oldId, next.id)) {
    throw new Error(`supersede: would create a cycle ("${next.id}" is already downstream of "${oldId}")`);
  }

  const newEdges: EdgeRef[] = [...next.edges, { type: "supersedes", target: oldId }];
  if (opts.restates) newEdges.push({ type: "restates", target: opts.restates });

  return {
    old: { ...old, edges: [...old.edges, { type: "superseded-by", target: next.id }] },
    next: { ...next, edges: newEdges },
  };
}
