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
 * A wide-ranging node grazes many focused beliefs on a word each; a real
 * disagreement is with one belief, or a few. So an unanchored node whose
 * candidate conflicts exceed this fan-out is a grazer and its conflicts are
 * dropped — "a belief that contradicts everything contradicts nothing."
 *
 * This is the robust discriminator a per-pair overlap test cannot be: a terse
 * genuine conflict shares as little vocabulary as a graze does ("all SQL is
 * parameterized" vs a string-concat default share only "sql"), so tightening
 * the per-pair bar to suppress the flood silences real conflicts too. What
 * actually separated the flood was fan-out — one broad value grazed eleven
 * unrelated invariants (dogfood 2026-09-10), while every genuine conflict pairs
 * one-to-one. Capping fan-out suppresses the former and keeps the latter.
 */
const MAX_UNANCHORED_FANOUT = 3;

/**
 * Discriminating tokens of one body: significant words the corpus does not lean
 * on. `max(2, …)` keeps a word shared by only the pair (df 2) discriminating
 * even in a tiny store, while a word most of the store uses is filtered out.
 */
function discriminatingTokens(node: MemoryNode, df: Map<string, number>, total: number): Set<string> {
  const ambientAbove = Math.max(2, total * DOMAIN_DF_RATIO);
  return new Set([...significantTokens(node.body)].filter((t) => (df.get(t) ?? 0) <= ambientAbove));
}

/** Whether two token sets share any member — the per-pair subject gate for an
 * unanchored pair: one non-ambient word both bodies use is a candidate (a real
 * subject or a graze; fan-out tells them apart). */
function intersects(a: Set<string>, b: Set<string>): boolean {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (big.has(token)) return true;
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
 *   unanchored pair is a candidate only on shared non-ambient vocabulary, and
 *   then a fan-out cap ({@link MAX_UNANCHORED_FANOUT}) drops a node that grazes
 *   many beliefs on a word each rather than disagreeing with one. Anchored
 *   pairs need neither gate — the shared locator IS the subject, and never
 *   grazes.
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
    const anchored = parties.some((n) => n.anchors.length > 0);
    const df = documentFrequency(parties);
    const disc = new Map(parties.map((n) => [n.id, discriminatingTokens(n, df, parties.length)]));
    const sameSubject = (a: MemoryNode, b: MemoryNode): boolean =>
      anchored || intersects(disc.get(a.id)!, disc.get(b.id)!);

    const candidates: Conflict[] = [];
    for (const invariantNode of invariants) {
      for (const defaultNode of defaults) {
        if (!directlyRelated(invariantNode, defaultNode) && sameSubject(invariantNode, defaultNode)) {
          candidates.push({ subject, invariantNode, defaultNode });
        }
      }
    }

    // An anchored group's shared locator IS the subject — every candidate is
    // real. An unanchored group's subject is inferred, so drop the grazers: a
    // node whose candidate count exceeds the fan-out cap is contradicting a
    // shared word across unrelated beliefs, not disagreeing with each.
    if (anchored) {
      conflicts.push(...candidates);
      continue;
    }
    const fanOut = new Map<string, number>();
    for (const c of candidates) {
      fanOut.set(c.invariantNode.id, (fanOut.get(c.invariantNode.id) ?? 0) + 1);
      fanOut.set(c.defaultNode.id, (fanOut.get(c.defaultNode.id) ?? 0) + 1);
    }
    for (const c of candidates) {
      if (fanOut.get(c.invariantNode.id)! <= MAX_UNANCHORED_FANOUT && fanOut.get(c.defaultNode.id)! <= MAX_UNANCHORED_FANOUT) {
        conflicts.push(c);
      }
    }
  }
  return conflicts;
}
