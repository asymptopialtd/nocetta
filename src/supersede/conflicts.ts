import { significantTokens } from "../text/tokens.js";
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

/**
 * A word most parties in a group use names the *domain*, not a subject. In a
 * store whose every belief is about "memory"/"recall"/"node", those words are
 * ambient vocabulary — a collision on one is not evidence two beliefs are about
 * the same thing (dogfood 2026-09-09: every fresh invariant flagged against
 * every unrelated default in scope:global). Document frequency is the measure:
 * a token carried by more than half the parties — and by more than the two in
 * question, so a word shared by only the pair always still counts — is ambient.
 */
const DOMAIN_DF_RATIO = 0.5;

function documentFrequency(parties: MemoryNode[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const node of parties) {
    for (const token of significantTokens(node.body)) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * Positive subject evidence for an UNANCHORED pair: a word both bodies use that
 * is not ambient across the corpus. `max(2, …)` keeps a word shared by only the
 * pair (df 2) discriminating even in a tiny store, while a word most of the
 * store uses is filtered out — precision over recall, as the plan demands.
 */
function sharesDiscriminatingToken(a: MemoryNode, b: MemoryNode, df: Map<string, number>, total: number): boolean {
  const ambientAbove = Math.max(2, total * DOMAIN_DF_RATIO);
  const bTokens = significantTokens(b.body);
  for (const token of significantTokens(a.body)) {
    if (bTokens.has(token) && (df.get(token) ?? 0) <= ambientAbove) return true;
  }
  return false;
}

const RELATION_TYPES = new Set(["superseded-by", "supersedes", "restates"]);

/** Exported for duplicates.ts, which must likewise skip pairs a supersession
 * or restatement already relates — the resolution working, not a problem. */
export function directlyRelated(a: MemoryNode, b: MemoryNode): boolean {
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
 *   vocabulary both bodies use that is *not* ambient across the store (see
 *   {@link sharesDiscriminatingToken} — a word most beliefs use names the
 *   domain, not a subject). Anchored pairs need no such gate — the shared
 *   locator IS the subject.
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
    const df = documentFrequency(parties);
    const sameSubject = (a: MemoryNode, b: MemoryNode): boolean =>
      a.anchors.length > 0 || sharesDiscriminatingToken(a, b, df, parties.length);
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
