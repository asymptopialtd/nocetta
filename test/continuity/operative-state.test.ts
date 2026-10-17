import { describe, expect, it } from "vitest";
import { asOf } from "../../src/bitemporal/as-of.js";
import { filterLive, resolveToTip } from "../../src/retrieval/pipeline.js";
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
    retiredReason: null,
    body: "body",
    ...overrides,
  };
}

describe("GovKM continuity fixture: no operative-state resurrection", () => {
  it("does not fall back to a superseded predecessor when the supersession tip is no longer current", () => {
    const t1 = "2026-01-01T00:00:00.000Z";
    const t2 = "2026-02-01T00:00:00.000Z";
    const t3 = "2026-03-01T00:00:00.000Z";
    const t4 = "2026-04-01T00:00:00.000Z";

    const a = node({
      id: "supplier-a",
      txnTime: t1,
      validFrom: t1,
      body: "Supplier A is the approved source for component X.",
    });

    const b = node({
      id: "supplier-b",
      body: "Supplier B is the approved source for component X.",
    });

    const step = supersede([a], "supplier-a", b, { now: t2 });

    // Later, B itself ceases to be current without establishing a replacement.
    // The prior A record remains valid history, but must not become operative again.
    const retiredB: MemoryNode = {
      ...step.next,
      validTo: t3,
      retiredReason: "supplier approval ended; replacement not yet established",
    };

    const nodes = [step.old, retiredB];
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Retrieval that starts from historical A should resolve forward to B.
    const resolved = resolveToTip(
      [{ node: step.old, matchedFiles: new Set<string>() }],
      byId,
    );
    expect(resolved.map((c) => c.node.id)).toEqual(["supplier-b"]);

    // At t4, B is no longer live. The pipeline must return no current answer,
    // not resurrect A merely because A was once valid.
    const live = filterLive(resolved, {
      now: t4,
      nodes,
      repoState: new Map(),
    });
    expect(live).toEqual([]);

    // Transaction-time reconstruction records what was written, not which
    // supplier was valid at an arbitrary fact-time instant. B's retirement
    // is represented by validTo, not by a separate transaction-log write.
    expect(asOf(nodes, "2026-01-15T00:00:00.000Z").map((n) => n.id)).toEqual(["supplier-a"]);
    expect(asOf(nodes, "2026-02-15T00:00:00.000Z").map((n) => n.id)).toEqual(["supplier-b"]);
    expect(asOf(nodes, t4).map((n) => n.id)).toEqual(["supplier-b"]);

    // Fact-time selection must preserve the historical operative windows.
    const validAt = (at: string) =>
      nodes.filter((n) => n.validFrom <= at && (n.validTo === null || at < n.validTo));
    expect(validAt("2026-01-15T00:00:00.000Z").map((n) => n.id)).toEqual(["supplier-a"]);
    expect(validAt("2026-02-15T00:00:00.000Z").map((n) => n.id)).toEqual(["supplier-b"]);
    expect(validAt(t4)).toEqual([]);
  });
});
