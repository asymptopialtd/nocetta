import type { MemoryNode } from "../store/types.js";
import type { RecallEvent } from "./log.js";
import type { MemoryClass } from "./residual.js";

export interface LedgerEntry {
  id: string;
  summary: string;
  klass: MemoryClass;
  /** How many recalls surfaced this node. */
  surfaced: number;
  /** How many of those the agent acknowledged using (rung 2). */
  cited: number;
}

/**
 * The 2×2 of (surfaced?) × (complement?) — the four ways a memory can be
 * earning, wasting, waiting, or spent. The never-surfaced row splits by class
 * on purpose: an unused *complement* is latent insurance, not dead weight, so
 * only the unused *covered* quadrant is ever a prune candidate. That encodes
 * the whole thesis — "never recalled" alone never means "delete".
 */
export interface Ledger {
  /** Surfaced and beyond the code — proven value; cited ones are rung 2. */
  working: LedgerEntry[];
  /** Surfaced but the code already covers it — recall noise, a swing at air. */
  redundant: LedgerEntry[];
  /** Never surfaced but beyond the code — latent insurance, kept untested. */
  dormant: LedgerEntry[];
  /** Never surfaced and already covered by the code — the one safe-to-clear
   * quadrant, and even then a gentle candidate, never an auto-delete. */
  prunable: LedgerEntry[];
}

function tally(events: readonly RecallEvent[]): { surfaced: Map<string, number>; cited: Map<string, number> } {
  const surfaced = new Map<string, number>();
  const cited = new Map<string, number>();
  for (const event of events) {
    const target = event.kind === "recall" ? surfaced : cited;
    for (const id of event.ids) target.set(id, (target.get(id) ?? 0) + 1);
  }
  return { surfaced, cited };
}

/**
 * Fold the recall log over the current node set into the four buckets. Pure:
 * `classOf` is injected so the artifact-reading classifier stays out of the
 * fold (the CLI wires the real one; tests stub it). `nodes` should already be
 * the current view — dead beliefs are not part of a live value picture.
 */
export function buildLedger(
  nodes: readonly MemoryNode[],
  events: readonly RecallEvent[],
  classOf: (node: MemoryNode) => MemoryClass,
): Ledger {
  const { surfaced, cited } = tally(events);
  const ledger: Ledger = { working: [], redundant: [], dormant: [], prunable: [] };
  for (const node of nodes) {
    const seen = surfaced.get(node.id) ?? 0;
    const klass = classOf(node);
    const entry: LedgerEntry = {
      id: node.id,
      summary: node.summary ?? node.body.split("\n")[0]!.slice(0, 80),
      klass,
      surfaced: seen,
      cited: cited.get(node.id) ?? 0,
    };
    const complement = klass === "complement";
    const bucket = seen > 0 ? (complement ? ledger.working : ledger.redundant) : complement ? ledger.dormant : ledger.prunable;
    bucket.push(entry);
  }
  for (const key of ["working", "redundant", "dormant", "prunable"] as const) {
    ledger[key].sort((a, b) => b.cited - a.cited || b.surfaced - a.surfaced || a.id.localeCompare(b.id));
  }
  return ledger;
}
