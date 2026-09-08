import { sharesSignificantToken } from "../text/tokens.js";
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
 *
 * Noise discipline: an advisory the reader learns to ignore is worse than no
 * advisory, because it takes real conflicts down with it. Two guards follow
 * from that:
 * - Superseded nodes are dead beliefs; a disagreement among the dead is not
 *   attention-worthy and is skipped outright.
 * - For UNANCHORED nodes the subject is a guess — scope groups them, but scope
 *   is not "about the same thing" (dogfood: a closed-source policy vs a
 *   test-runner preference, same global scope, flagged as contradicting). An
 *   unanchored pair conflicts only on positive evidence of shared subject:
 *   vocabulary both bodies actually use. Anchored pairs need no such gate —
 *   the shared locator IS the subject.
 */
export function findConflicts(nodes: MemoryNode[]): Conflict[] {
  const groups = new Map<string, MemoryNode[]>();
  for (const node of nodes) {
    if (node.edges.some((e) => e.type === "superseded-by")) continue;
    const key = subjectKey(node);
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }

  const conflicts: Conflict[] = [];
  for (const [subject, group] of groups) {
    // Entity nodes are referents (a symbol table for prose), not assertions —
    // they cannot contradict a policy, and grouping them in surfaces phantom
    // conflicts (dogfood: every global invariant flagged against the
    // "Nocetta" entity). Only claim/value/lore-fact parties conflict.
    const parties = group.filter((n) => n.kind !== "entity");
    const invariants = parties.filter((n) => n.authority === "invariant");
    const defaults = parties.filter((n) => n.authority === "default");
    const sameSubject = (a: MemoryNode, b: MemoryNode): boolean =>
      a.anchors.length > 0 || sharesSignificantToken(a.body, b.body);
    for (const invariantNode of invariants) {
      for (const defaultNode of defaults) {
        if (!directlyRelated(invariantNode, defaultNode) && sameSubject(invariantNode, defaultNode)) {
          conflicts.push({ subject, invariantNode, defaultNode });
        }
      }
    }
  }
  return conflicts;
}
