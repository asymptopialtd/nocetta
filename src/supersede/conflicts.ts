import type { MemoryNode } from "../store/types.js";

export interface Conflict {
  subject: string;
  invariantNode: MemoryNode;
  defaultNode: MemoryNode;
}

/** Nodes anchored to the same code symbols share a subject; unanchored
 * nodes (values/decisions) share a subject if they're in the same scope. */
function subjectKey(node: MemoryNode): string {
  if (node.anchors.length > 0) {
    return node.anchors
      .map((a) => a.locator)
      .sort()
      .join("|");
  }
  return `scope:${node.scope}`;
}

const RELATION_TYPES = new Set(["superseded-by", "supersedes", "restates"]);

function directlyRelated(a: MemoryNode, b: MemoryNode): boolean {
  return (
    a.edges.some((e) => RELATION_TYPES.has(e.type) && e.target === b.id) ||
    b.edges.some((e) => RELATION_TYPES.has(e.type) && e.target === a.id)
  );
}

/**
 * Surface (never auto-resolve) same-subject nodes whose authority classes
 * disagree and which aren't already related by supersession/restatement.
 * Recency wins *within* an authority class; across classes the plan is
 * explicit that conflicts must surface rather than silently pick a winner.
 */
export function findConflicts(nodes: MemoryNode[]): Conflict[] {
  const groups = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    const key = subjectKey(node);
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }

  const conflicts: Conflict[] = [];
  for (const [subject, group] of groups) {
    const invariants = group.filter((n) => n.authority === "invariant");
    const defaults = group.filter((n) => n.authority === "default");
    for (const invariantNode of invariants) {
      for (const defaultNode of defaults) {
        if (!directlyRelated(invariantNode, defaultNode)) {
          conflicts.push({ subject, invariantNode, defaultNode });
        }
      }
    }
  }
  return conflicts;
}
