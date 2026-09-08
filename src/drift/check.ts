import { locate } from "../anchor/locate.js";
import type { MemoryNode } from "../store/types.js";
import type { RepoState } from "./repo-state.js";

export interface CheckResult {
  dirty: Set<string>;
  /** short human-readable reason per dirty node id, for debuggability. */
  reasons: Map<string, string>;
}

function isSuperseded(node: MemoryNode): boolean {
  return node.edges.some((e) => e.type === "superseded-by");
}

/**
 * Recompute every anchor's hash against `repoState` and flag dirty nodes.
 *
 * A node is directly dirty if any of its own anchors no longer resolve
 * (symbol not found — renamed/deleted/artifact missing) or resolve with a
 * changed hash (body edited). Dirtiness then propagates along `anchored-to`
 * edges (a node with `anchored-to → X` inherits X's dirtiness), stopping at
 * superseded nodes: propagation does not continue past a node that already
 * carries a `superseded-by` edge, since a superseded node is already
 * excluded from "current" and chasing its dependents further is moot.
 */
export function check(nodes: MemoryNode[], repoState: RepoState): CheckResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dirty = new Set<string>();
  const reasons = new Map<string, string>();

  const markDirty = (id: string, reason: string): void => {
    if (!dirty.has(id)) {
      dirty.add(id);
      reasons.set(id, reason);
    }
  };

  // 1. Direct dirtiness: recompute each node's own code anchors.
  for (const node of nodes) {
    for (const anchor of node.anchors) {
      const source = repoState.get(anchor.artifactPath);
      if (source === undefined) {
        markDirty(node.id, `artifact missing: ${anchor.artifactPath}`);
        continue;
      }
      const result = locate(anchor, source);
      if (!result.found) {
        markDirty(node.id, `symbol not found: ${anchor.locator}`);
      } else if (result.hashChanged) {
        markDirty(node.id, `hash changed: ${anchor.locator}`);
      }
    }
  }

  // 2. Propagate along anchored-to edges (dependent → depended-on), stopping at superseded nodes.
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const edge of node.edges) {
      if (edge.type === "anchored-to" && byId.has(edge.target)) {
        const list = dependents.get(edge.target) ?? [];
        list.push(node.id);
        dependents.set(edge.target, list);
      }
    }
  }

  const queue = [...dirty];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = byId.get(currentId);
    if (currentNode && isSuperseded(currentNode)) continue; // wall: do not propagate past a superseded node

    for (const depId of dependents.get(currentId) ?? []) {
      if (!dirty.has(depId)) {
        markDirty(depId, `propagated from ${currentId}`);
        queue.push(depId);
      }
    }
  }

  return { dirty, reasons };
}

/** Minimal "current" view for Slice 3: every node not flagged dirty. Slice 4
 * builds this out into the full candidate → resolve-tip → scope/window →
 * rank → budget pipeline; this is the drift-exclusion half of that. */
export function currentNodes(nodes: MemoryNode[], repoState: RepoState): MemoryNode[] {
  const { dirty } = check(nodes, repoState);
  return nodes.filter((n) => !dirty.has(n.id));
}
