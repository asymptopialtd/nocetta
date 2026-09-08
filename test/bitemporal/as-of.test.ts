import { describe, expect, it } from "vitest";
import { asOf } from "../../src/bitemporal/as-of.js";
import { supersede } from "../../src/supersede/supersede.js";
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

describe("asOf", () => {
  it("returns the belief held at T across a walk-back chain A -> B -> A''", () => {
    const t1 = "2026-01-01T00:00:00.000Z";
    const t2 = "2026-02-01T00:00:00.000Z";
    const t3 = "2026-03-01T00:00:00.000Z";

    const a = node({ id: "a", txnTime: t1, body: "we use library X" });
    const step1 = supersede([a], "a", node({ id: "b", body: "we switched to library Y" }), { now: t2 });
    const step2 = supersede([step1.old, step1.next], "b", node({ id: "a2", body: "back to library X" }), {
      now: t3,
      restates: "a",
    });

    const allNodes = [step1.old, step2.old, step2.next]; // a (closed at t2), b (closed at t3), a2

    expect(asOf(allNodes, "2026-01-15T00:00:00.000Z").map((n) => n.id)).toEqual(["a"]);
    expect(asOf(allNodes, "2026-02-15T00:00:00.000Z").map((n) => n.id)).toEqual(["b"]);
    expect(asOf(allNodes, "2026-03-15T00:00:00.000Z").map((n) => n.id)).toEqual(["a2"]);
    // Exactly at a transition: the writing txn is included, so it reads as current from that instant.
    expect(asOf(allNodes, t2).map((n) => n.id)).toEqual(["b"]);
  });

  it("excludes nodes not yet written as of T, alongside nodes never superseded", () => {
    const early = node({ id: "early", txnTime: "2026-01-01T00:00:00.000Z" });
    const late = node({ id: "late", txnTime: "2026-06-01T00:00:00.000Z" });
    const result = asOf([early, late], "2026-03-01T00:00:00.000Z");
    expect(result.map((n) => n.id)).toEqual(["early"]);
  });
});
