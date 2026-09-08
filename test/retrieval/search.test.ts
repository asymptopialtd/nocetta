import { describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/anchor/symbols.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { contextTriggered, searchMemory } from "../../src/retrieval/search.js";
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

const BILLING_PATH = "src/billing.ts";
const billingSource = "export function calculateTotal(): number {\n  return 1;\n}\n";
const billingHash = extractSymbols(BILLING_PATH, billingSource)[0]!.hash;

describe("searchMemory (full pipeline)", () => {
  const files = { [BILLING_PATH]: billingSource };

  it("surfaces a live memory anchored to a file in play", () => {
    const claim = node({
      id: "claim1",
      anchors: [{ locator: `${BILLING_PATH} › function calculateTotal`, hash: billingHash, artifactPath: BILLING_PATH }],
      body: "calculateTotal always returns a non-negative number.",
    });
    const results = searchMemory([claim], repoStateFromFiles(files), { filesInPlay: [BILLING_PATH] });
    expect(results.map((r) => r.node.id)).toEqual(["claim1"]);
  });

  it("excludes a dirty memory (its anchor no longer matches live source) from results", () => {
    const claim = node({
      id: "stale",
      anchors: [{ locator: `${BILLING_PATH} › function calculateTotal`, hash: "definitely-wrong", artifactPath: BILLING_PATH }],
      body: "outdated claim",
    });
    const results = searchMemory([claim], repoStateFromFiles(files), { filesInPlay: [BILLING_PATH] });
    expect(results).toEqual([]);
  });

  it("does not surface a memory with no anchor into the files in play", () => {
    const claim = node({ id: "unrelated", anchors: [{ locator: "other.ts › function h", hash: "x", artifactPath: "other.ts" }] });
    const results = searchMemory([claim], repoStateFromFiles(files), { filesInPlay: [BILLING_PATH] });
    expect(results).toEqual([]);
  });

  it("respects maxResults and maxBodyChars end to end", () => {
    const nodes: MemoryNode[] = [];
    for (let i = 0; i < 5; i++) {
      nodes.push(
        node({
          id: `n${i}`,
          txnTime: new Date(2026, 0, i + 1).toISOString(),
          anchors: [{ locator: `${BILLING_PATH} › function calculateTotal`, hash: billingHash, artifactPath: BILLING_PATH }],
          body: "x".repeat(20),
        }),
      );
    }

    const results = searchMemory(nodes, repoStateFromFiles(files), {
      filesInPlay: [BILLING_PATH],
      maxResults: 10,
      maxBodyChars: 45,
    });
    expect(results.length).toBe(2); // 20 + 20 <= 45, +20 would exceed
  });
});

describe("contextTriggered", () => {
  it("is sugar over searchMemory keyed on a file set", () => {
    const files = { "a.ts": "export function f() { return 1; }\n" };
    const hash = extractSymbols("a.ts", files["a.ts"]!)[0]!.hash;
    const claim = node({
      id: "c",
      anchors: [{ locator: "a.ts › function f", hash, artifactPath: "a.ts" }],
    });
    const results = contextTriggered([claim], repoStateFromFiles(files), ["a.ts"]);
    expect(results.map((r) => r.node.id)).toEqual(["c"]);
  });
});
