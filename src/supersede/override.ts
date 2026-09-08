import { supersede } from "./supersede.js";
import type { SupersedeOptions } from "./supersede.js";
import type { MemoryNode } from "../store/types.js";

/**
 * Override a `default`-authority value/decision node, recording a mandatory
 * reason on the overriding node. An `invariant` node may never be
 * overridden this way (per the plan: "an invariant may not [be overridden]")
 * — attempting it is a hard error, not a silent no-op or a downgrade.
 */
export function overrideValue(
  nodes: readonly MemoryNode[],
  oldId: string,
  next: MemoryNode,
  reason: string,
  opts: SupersedeOptions = {},
): { old: MemoryNode; next: MemoryNode } {
  const old = nodes.find((n) => n.id === oldId);
  if (!old) throw new Error(`overrideValue: unknown node "${oldId}"`);
  if (old.authority === "invariant") {
    throw new Error(`overrideValue: "${oldId}" is invariant and cannot be overridden`);
  }
  if (!reason.trim()) {
    throw new Error("overrideValue: a non-empty reason is required");
  }
  return supersede(nodes, oldId, { ...next, overrideReason: reason }, opts);
}
