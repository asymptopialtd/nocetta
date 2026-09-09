import { describe, expect, it } from "vitest";
import {
  applyBudget,
  candidatesFromFiles,
  filterLive,
  rankCandidates,
  resolveToTip,
} from "../../src/retrieval/pipeline.js";
import type { Candidate, RankedCandidate } from "../../src/retrieval/types.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
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

const A1 = { locator: "a.ts › function f", hash: "h1", artifactPath: "a.ts" };
const B1 = { locator: "b.ts › function g", hash: "h2", artifactPath: "b.ts" };

describe("candidatesFromFiles", () => {
  it("returns only nodes with an anchor into the file set, recording which files matched", () => {
    const n1 = node({ id: "n1", anchors: [A1] });
    const n2 = node({ id: "n2", anchors: [B1] });
    const n3 = node({ id: "n3", anchors: [] }); // no anchors: never a direct candidate
    const candidates = candidatesFromFiles([n1, n2, n3], ["a.ts"]);
    expect(candidates.map((c) => c.node.id)).toEqual(["n1"]);
    expect(candidates[0]!.matchedFiles).toEqual(new Set(["a.ts"]));
  });

  it("matches on multiple files in play", () => {
    const n1 = node({ id: "n1", anchors: [A1, B1] });
    const candidates = candidatesFromFiles([n1], ["a.ts", "b.ts"]);
    expect(candidates[0]!.matchedFiles).toEqual(new Set(["a.ts", "b.ts"]));
  });
});

describe("resolveToTip", () => {
  it("follows superseded-by forward to the tip and returns the tip node, not the candidate", () => {
    const old = node({ id: "old", edges: [{ type: "superseded-by", target: "new" }] });
    const tip = node({ id: "new" });
    const byId = new Map([
      ["old", old],
      ["new", tip],
    ]);
    const resolved = resolveToTip([{ node: old, matchedFiles: new Set(["a.ts"]) }], byId);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.node.id).toBe("new");
  });

  it("merges two candidates that resolve to the same tip, unioning matchedFiles", () => {
    const oldA = node({ id: "oldA", edges: [{ type: "superseded-by", target: "tip" }] });
    const oldB = node({ id: "oldB", edges: [{ type: "superseded-by", target: "tip" }] });
    const tip = node({ id: "tip" });
    const byId = new Map([
      ["oldA", oldA],
      ["oldB", oldB],
      ["tip", tip],
    ]);
    const candidates: Candidate[] = [
      { node: oldA, matchedFiles: new Set(["a.ts"]) },
      { node: oldB, matchedFiles: new Set(["b.ts"]) },
    ];
    const resolved = resolveToTip(candidates, byId);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.matchedFiles).toEqual(new Set(["a.ts", "b.ts"]));
  });

  it("a node with no superseded-by edge resolves to itself (already the tip)", () => {
    const n = node({ id: "n" });
    const resolved = resolveToTip([{ node: n, matchedFiles: new Set() }], new Map([["n", n]]));
    expect(resolved[0]!.node.id).toBe("n");
  });

  it("a dangling superseded-by edge is an honest stay, not a crash", () => {
    const n = node({ id: "n", edges: [{ type: "superseded-by", target: "ghost" }] });
    const resolved = resolveToTip([{ node: n, matchedFiles: new Set() }], new Map([["n", n]]));
    expect(resolved[0]!.node.id).toBe("n");
  });
});

describe("filterLive", () => {
  const files = { "a.ts": "export function f() { return 1; }\n" };

  it("drops nodes whose anchor has drifted (live dirty check)", () => {
    const drifted = node({ id: "drifted", anchors: [{ locator: "a.ts › function f", hash: "stale-hash", artifactPath: "a.ts" }] });
    const clean = node({ id: "clean", anchors: [] });
    const repoState = repoStateFromFiles(files);
    const result = filterLive([{ node: drifted, matchedFiles: new Set() }, { node: clean, matchedFiles: new Set() }], {
      nodes: [drifted, clean],
      repoState,
    });
    expect(result.map((c) => c.node.id)).toEqual(["clean"]);
  });

  it("keeps global-scope nodes regardless of query scope, drops mismatched scoped nodes", () => {
    const global = node({ id: "global", scope: "global" });
    const scopedMatch = node({ id: "scopedMatch", scope: "billing" });
    const scopedMismatch = node({ id: "scopedMismatch", scope: "auth" });
    const nodes = [global, scopedMatch, scopedMismatch];
    const candidates: Candidate[] = nodes.map((n) => ({ node: n, matchedFiles: new Set<string>() }));
    const result = filterLive(candidates, { scope: "billing", nodes, repoState: repoStateFromFiles({}) });
    expect(result.map((c) => c.node.id).sort()).toEqual(["global", "scopedMatch"]);
  });

  it("drops nodes outside their valid-time window", () => {
    const notYetValid = node({ id: "future", validFrom: "2099-01-01T00:00:00.000Z" });
    const expired = node({ id: "expired", validFrom: "2020-01-01T00:00:00.000Z", validTo: "2021-01-01T00:00:00.000Z" });
    const stillValid = node({ id: "valid", validFrom: "2020-01-01T00:00:00.000Z", validTo: null });
    const nodes = [notYetValid, expired, stillValid];
    const candidates: Candidate[] = nodes.map((n) => ({ node: n, matchedFiles: new Set<string>() }));
    const result = filterLive(candidates, { now: "2026-01-01T00:00:00.000Z", nodes, repoState: repoStateFromFiles({}) });
    expect(result.map((c) => c.node.id)).toEqual(["valid"]);
  });
});

describe("rankCandidates", () => {
  it("more matched files outranks fewer, regardless of recency", () => {
    const older = node({ id: "older", txnTime: "2020-01-01T00:00:00.000Z" });
    const newer = node({ id: "newer", txnTime: "2026-01-01T00:00:00.000Z" });
    const candidates: Candidate[] = [
      { node: older, matchedFiles: new Set(["a.ts", "b.ts"]) },
      { node: newer, matchedFiles: new Set(["a.ts"]) },
    ];
    const ranked = rankCandidates(candidates, "2026-01-01T00:00:00.000Z");
    expect(ranked.map((c) => c.node.id)).toEqual(["older", "newer"]);
  });

  it("breaks ties on matched-file count by recency", () => {
    const older = node({ id: "older", txnTime: "2020-01-01T00:00:00.000Z" });
    const newer = node({ id: "newer", txnTime: "2026-01-01T00:00:00.000Z" });
    const candidates: Candidate[] = [
      { node: older, matchedFiles: new Set(["a.ts"]) },
      { node: newer, matchedFiles: new Set(["a.ts"]) },
    ];
    const ranked = rankCandidates(candidates, "2026-01-01T00:00:00.000Z");
    expect(ranked.map((c) => c.node.id)).toEqual(["newer", "older"]);
  });
});

describe("applyBudget", () => {
  function ranked(id: string, bodyLen: number, score: number, summary?: string): RankedCandidate {
    return { node: node({ id, body: "x".repeat(bodyLen), summary }), matchedFiles: new Set(), score };
  }

  it("caps at maxResults", () => {
    const input = [ranked("a", 10, 3), ranked("b", 10, 2), ranked("c", 10, 1)];
    const out = applyBudget(input, { maxResults: 2 });
    expect(out.map((c) => c.node.id)).toEqual(["a", "b"]);
  });

  // Decision 81b95760: once the cumulative body budget is spent, remaining
  // ranked results are still returned (summary-only) rather than dropped —
  // structure and summary-first previews are the fix for oversized recall,
  // not silence.
  it("keeps remaining ranked results once the body-char budget is spent, summary-only rather than dropped", () => {
    const input = [ranked("a", 50, 3, "summary a"), ranked("b", 10, 2, "summary b"), ranked("c", 10, 1, "summary c")];
    const out = applyBudget(input, { maxBodyChars: 65 });
    expect(out.map((c) => c.node.id)).toEqual(["a", "b", "c"]); // nothing dropped
    expect(out[0]!.node.body).toBe("x".repeat(50)); // within budget: full body
    expect(out[1]!.node.body).toBe("x".repeat(10)); // still within budget: full body
    expect(out[2]!.node.body).toBe("summary c"); // budget spent: summary-only, not dropped
  });

  it("excerpts a single node whose body alone exceeds the whole budget to its summary plus a truncation marker — never dropped", () => {
    const oversized = applyBudget([ranked("solo", 1000, 1, "solo summary")], { maxBodyChars: 10 });
    expect(oversized.map((c) => c.node.id)).toEqual(["solo"]);
    expect(oversized[0]!.node.body).toContain("solo summary");
    expect(oversized[0]!.node.body).toContain("1000 chars");
    expect(oversized[0]!.node.body).toMatch(/truncated/);
  });

  it("falls back to the body's first line as the preview label when a node has no summary", () => {
    const input: RankedCandidate[] = [
      ranked("a", 50, 2),
      { node: node({ id: "b", body: "first line\nsecond line" }), matchedFiles: new Set(), score: 1 },
    ];
    const out = applyBudget(input, { maxBodyChars: 55 });
    expect(out[1]!.node.body).toBe("first line");
  });
});
