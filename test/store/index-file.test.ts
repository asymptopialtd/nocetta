import { describe, expect, it } from "vitest";
import { isCurrent, renderIndex } from "../../src/store/index-file.js";
import type { MemoryNode } from "../../src/store/types.js";

const NOW = "2026-06-01T00:00:00.000Z";

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
    body: "a claim about the code",
    ...overrides,
  };
}

describe("isCurrent", () => {
  it("is false for a superseded node regardless of its valid-time window", () => {
    const n = node({ id: "a", edges: [{ type: "superseded-by", target: "b" }] });
    expect(isCurrent(n, NOW)).toBe(false);
  });

  it("is false before validFrom and once validTo has passed; true inside the window", () => {
    expect(isCurrent(node({ id: "future", validFrom: "2030-01-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isCurrent(node({ id: "expired", validTo: "2026-01-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isCurrent(node({ id: "live", validTo: null }), NOW)).toBe(true);
  });
});

describe("renderIndex", () => {
  it("carries a do-not-hand-edit header", () => {
    expect(renderIndex([], NOW)).toMatch(/auto-generated/i);
  });

  it("prints one line per current node — summary, kind, scope, anchor locator, id8 — omitting superseded and retired nodes", () => {
    const live = node({
      id: "11111111-0000-0000-0000-000000000000",
      summary: "foo returns 1",
      kind: "claim",
      scope: "global",
      anchors: [{ locator: "src/foo.ts › function foo", hash: "h", artifactPath: "src/foo.ts" }],
    });
    const superseded = node({ id: "22222222-0000-0000-0000-000000000000", edges: [{ type: "superseded-by", target: live.id }] });
    const retired = node({ id: "33333333-0000-0000-0000-000000000000", validTo: "2026-01-02T00:00:00.000Z", retiredReason: "gone" });

    const text = renderIndex([live, superseded, retired], NOW);
    expect(text).toContain("- foo returns 1 — claim, global, src/foo.ts › function foo (11111111)");
    expect(text).not.toContain("22222222");
    expect(text).not.toContain("33333333");
  });

  it("falls back to the body's first line and to \"unanchored\" when a node has no summary or anchors", () => {
    const n = node({ id: "44444444-0000-0000-0000-000000000000", body: "an undocumented decision\nmore detail", anchors: [] });
    const text = renderIndex([n], NOW);
    expect(text).toContain("- an undocumented decision — claim, global, unanchored (44444444)");
  });

  it("reports no current memories rather than an empty body when nothing is current", () => {
    expect(renderIndex([], NOW)).toContain("(no current memories)");
  });
});
