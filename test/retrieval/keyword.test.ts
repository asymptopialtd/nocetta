import { describe, expect, it } from "vitest";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { candidatesFromKeyword } from "../../src/retrieval/keyword.js";
import { searchMemory } from "../../src/retrieval/search.js";
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

describe("candidatesFromKeyword (BM25)", () => {
  it("recalls a node whose body mentions the queried identifier", () => {
    const target = node({ id: "target", body: "calculateTotal sums every line item into a grand total." });
    const noise = node({ id: "noise", body: "formatCurrency renders two decimal places for display." });
    const candidates = candidatesFromKeyword([target, noise], "calculateTotal");
    expect(candidates.map((c) => c.node.id)).toEqual(["target"]);
    expect(candidates[0]!.keywordScore).toBeGreaterThan(0);
  });

  it("ranks a node mentioning the identifier twice above one mentioning it once", () => {
    const twice = node({ id: "twice", body: "calculateTotal calls calculateTotal recursively for nested invoices." });
    const once = node({ id: "once", body: "calculateTotal is defined in billing.ts." });
    const candidates = candidatesFromKeyword([twice, once], "calculateTotal");
    const byId = new Map(candidates.map((c) => [c.node.id, c.keywordScore!]));
    expect(byId.get("twice")!).toBeGreaterThan(byId.get("once")!);
  });

  it("returns nothing for an empty query and nothing for no matches", () => {
    const n = node({ id: "n", body: "some prose" });
    expect(candidatesFromKeyword([n], "")).toEqual([]);
    expect(candidatesFromKeyword([n], "nonexistentTerm")).toEqual([]);
  });
});

describe("searchMemory with a keyword query", () => {
  it("surfaces a keyword-matched node with no anchor into the files in play", () => {
    const claim = node({
      id: "value-claim",
      kind: "value",
      body: "we always validate calculateTotal's output before persisting an invoice.",
    });
    const results = searchMemory([claim], repoStateFromFiles({}), {
      filesInPlay: [],
      keyword: "calculateTotal",
    });
    expect(results.map((r) => r.node.id)).toEqual(["value-claim"]);
  });

  it("combines anchor and keyword candidate-gen without duplicating a node matched by both", () => {
    const files = { "src/billing.ts": "export function calculateTotal(): number {\n  return 1;\n}\n" };
    const claim = node({
      id: "both",
      anchors: [{ locator: "src/billing.ts › function calculateTotal", hash: "will-be-fixed", artifactPath: "src/billing.ts" }],
      body: "calculateTotal is the single source of truth for invoice totals.",
    });
    // Give it the real hash so it isn't flagged dirty.
    const results = searchMemory([claim], repoStateFromFiles(files), {
      filesInPlay: ["src/billing.ts"],
      keyword: "calculateTotal",
    });
    // Excluded here because the anchor hash is stale (dirty) — proves the
    // keyword path doesn't bypass the live dirty check either.
    expect(results).toEqual([]);
  });
});
