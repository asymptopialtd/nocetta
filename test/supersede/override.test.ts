import { describe, expect, it } from "vitest";
import { resolveToTip } from "../../src/retrieval/pipeline.js";
import { overrideValue } from "../../src/supersede/override.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(overrides: Partial<MemoryNode> & { id: string }): MemoryNode {
  return {
    kind: "value",
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

describe("overrideValue", () => {
  it("overrides a default value node, recording the reason on the new node, and resolves to it", () => {
    const original = node({ id: "v1", body: "we cap page size at 20" });
    const replacement = node({ id: "v2", body: "we cap page size at 50" });
    const { old, next } = overrideValue([original], "v1", replacement, "20 was too aggressive under real load");

    expect(next.overrideReason).toBe("20 was too aggressive under real load");
    expect(old.edges).toContainEqual({ type: "superseded-by", target: "v2" });

    const byId = new Map([old, next].map((n) => [n.id, n]));
    const tip = resolveToTip([{ node: old, matchedFiles: new Set() }], byId);
    expect(tip[0]!.node.id).toBe("v2");
  });

  it("refuses to override an invariant node", () => {
    const invariantNode = node({ id: "inv", authority: "invariant", body: "never log secrets" });
    const replacement = node({ id: "next" });
    expect(() => overrideValue([invariantNode], "inv", replacement, "we changed our minds")).toThrow(/invariant/);
  });

  it("requires a non-empty reason", () => {
    const original = node({ id: "v1" });
    const replacement = node({ id: "v2" });
    expect(() => overrideValue([original], "v1", replacement, "")).toThrow(/reason/);
    expect(() => overrideValue([original], "v1", replacement, "   ")).toThrow(/reason/);
  });
});
