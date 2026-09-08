import { describe, expect, it } from "vitest";
import { resolveToTip } from "../../src/retrieval/pipeline.js";
import { findConflicts, retconImpact, supersede } from "../../src/supersede/index.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(overrides: Partial<MemoryNode> & { id: string }): MemoryNode {
  return {
    kind: "claim",
    scope: "global",
    anchors: [],
    edges: [],
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    txnTime: "2026-01-01T00:00:00.000Z",
    authority: "default",
    overrideReason: null,
    body: "body",
    ...overrides,
  };
}

describe("supersede", () => {
  it("edges old -> superseded-by -> next and next -> supersedes -> old, non-destructively", () => {
    const a = node({ id: "a", body: "original belief" });
    const b = node({ id: "b", body: "revised belief" });
    const { old, next } = supersede([a, b], "a", b);
    expect(old.edges).toContainEqual({ type: "superseded-by", target: "b" });
    expect(next.edges).toContainEqual({ type: "supersedes", target: "a" });
    // old is never mutated in place / deleted — the input object is untouched.
    expect(a.edges).toEqual([]);
  });

  it("records restates provenance for a walk-back node", () => {
    const a = node({ id: "a" });
    const a2 = node({ id: "a2" });
    const { next } = supersede([a], "a", a2, { restates: "a" });
    expect(next.edges).toContainEqual({ type: "restates", target: "a" });
  });

  it("rejects superseding a node that is already superseded (no fan-out)", () => {
    const a = node({ id: "a", edges: [{ type: "superseded-by", target: "b" }] });
    const c = node({ id: "c" });
    expect(() => supersede([a], "a", c)).toThrow(/already superseded/);
  });

  it("rejects a supersession that would close a cycle", () => {
    const a = node({ id: "a", edges: [{ type: "superseded-by", target: "b" }] });
    const b = node({ id: "b", edges: [{ type: "superseded-by", target: "c" }] });
    const c = node({ id: "c" });
    // c is already downstream of a (a -> b -> c); superseding c back to a would cycle.
    expect(() => supersede([a, b, c], "c", a)).toThrow(/cycle/);
  });

  it("allows fan-in: two different old nodes superseded by the same new node", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b" });
    const merged = node({ id: "merged" });

    const step1 = supersede([a, b, merged], "a", merged);
    const step2 = supersede([a, step1.old, b, step1.next], "b", step1.next);

    expect(step1.old.edges).toContainEqual({ type: "superseded-by", target: "merged" });
    expect(step2.old.edges).toContainEqual({ type: "superseded-by", target: "merged" });
    expect(step2.next.edges.filter((e) => e.type === "supersedes")).toEqual([
      { type: "supersedes", target: "a" },
      { type: "supersedes", target: "b" },
    ]);
  });

  it("walk-back: A -> B -> A'' (restates A) resolves to A''", () => {
    const a = node({ id: "a", body: "we use library X" });
    const b = node({ id: "b", body: "we switched to library Y" });
    const step1 = supersede([a], "a", b);

    const a2 = node({ id: "a2", body: "back to library X after all" });
    const step2 = supersede([step1.old, step1.next], "b", a2, { restates: "a" });

    const allNodes = [step1.old, step2.old, step2.next]; // a, b, a2 (updated)
    const byId = new Map(allNodes.map((n) => [n.id, n]));

    const tip = resolveToTip([{ node: step1.old, matchedFiles: new Set() }], byId);
    expect(tip[0]!.node.id).toBe("a2");
    expect(tip[0]!.node.edges).toContainEqual({ type: "restates", target: "a" });
  });
});

describe("findConflicts", () => {
  it("surfaces a cross-authority conflict on the same subject instead of auto-resolving", () => {
    const invariantNode = node({
      id: "inv",
      scope: "core",
      authority: "invariant",
      body: "never perform synchronous file IO on the hot path",
    });
    const defaultNode = node({
      id: "def",
      scope: "core",
      authority: "default",
      txnTime: "2026-06-01T00:00:00.000Z", // later, but recency must NOT auto-win across classes
      body: "use synchronous file IO here for simplicity",
    });
    const conflicts = findConflicts([invariantNode, defaultNode]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ invariantNode: { id: "inv" }, defaultNode: { id: "def" } });
  });

  it("does not flag a conflict when the nodes are directly related by supersession", () => {
    const a = node({ id: "a", scope: "core", authority: "invariant" });
    const b = node({ id: "b", scope: "core", authority: "default" });
    const { old, next } = supersede([a], "a", b);
    expect(findConflicts([old, next])).toEqual([]);
  });

  it("does not flag same-authority disagreement (that's just recency-wins, not a cross-class conflict)", () => {
    const a = node({ id: "a", scope: "core", authority: "default" });
    const b = node({ id: "b", scope: "core", authority: "default" });
    expect(findConflicts([a, b])).toEqual([]);
  });
});

describe("retconImpact", () => {
  it("returns the one-hop dependents of a superseded node (continuity worklist)", () => {
    const target = node({ id: "target", edges: [{ type: "superseded-by", target: "target2" }] });
    const dependent = node({ id: "dependent", edges: [{ type: "anchored-to", target: "target" }] });
    const unrelated = node({ id: "unrelated" });
    expect(retconImpact([target, dependent, unrelated], "target")).toEqual(["dependent"]);
  });
});
