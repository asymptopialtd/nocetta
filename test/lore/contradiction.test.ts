import { describe, expect, it } from "vitest";
import { checkConsistency, HeuristicContradictionFlagger } from "../../src/lore/contradiction.js";
import type { ContradictionFlagger, ContradictionSuggestion } from "../../src/lore/contradiction.js";
import { supersede } from "../../src/supersede/supersede.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(overrides: Partial<MemoryNode> & { id: string }): MemoryNode {
  return {
    kind: "lore-fact",
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

function entity(id: string, canonicalName: string): MemoryNode {
  return node({ id, kind: "entity", body: canonicalName, aliases: [] });
}

describe("HeuristicContradictionFlagger", () => {
  const flagger = new HeuristicContradictionFlagger();

  it("flags a new fact that disagrees on negation with an existing fact sharing a keyword", () => {
    const existing = node({ id: "f1", body: "Elminster is alive and well." });
    const candidate = node({ id: "f2", body: "Elminster is not alive anymore." });
    const suggestions = flagger.flag([existing], candidate);
    expect(suggestions).toEqual([{ factId: "f1", reason: expect.stringContaining("elminster") }]);
  });

  it("does not flag facts with no shared keyword", () => {
    const existing = node({ id: "f1", body: "Mystra governs magic." });
    const candidate = node({ id: "f2", body: "Elminster is not alive anymore." });
    expect(flagger.flag([existing], candidate)).toEqual([]);
  });

  it("does not flag an ordinary update that doesn't disagree on negation (heuristic's honest limit)", () => {
    const existing = node({ id: "f1", body: "Elminster lives in Shadowdale." });
    const candidate = node({ id: "f2", body: "Elminster now lives in Waterdeep." });
    expect(flagger.flag([existing], candidate)).toEqual([]);
  });
});

describe("checkConsistency", () => {
  it("retrieves the entity's live fact-set (excluding superseded facts) and delegates to the flagger", () => {
    const elminster = entity("elminster", "Elminster");
    const oldFact = node({ id: "old", body: "Elminster is alive." });
    const { old, next } = supersede([oldFact], "old", node({ id: "new", body: "Elminster is alive and thriving." }));
    const unrelated = node({ id: "unrelated", body: "Mystra governs magic." });

    const seen: MemoryNode[][] = [];
    const spyFlagger: ContradictionFlagger = {
      flag(existingFacts, _newFact): ContradictionSuggestion[] {
        seen.push(existingFacts);
        return [];
      },
    };

    const candidate = node({ id: "candidate", body: "Elminster is not alive anymore." });
    checkConsistency([elminster, old, next, unrelated], "elminster", candidate, spyFlagger);

    // the superseded "old" fact must not be in the live set handed to the flagger.
    const ids = seen[0]!.map((n) => n.id);
    expect(ids).toEqual(["new"]);
  });

  it("surfaces a real suggestion end to end with the heuristic flagger, without writing anything", () => {
    const elminster = entity("elminster", "Elminster");
    const existing = node({ id: "f1", body: "Elminster is alive." });
    const candidate = node({ id: "candidate", body: "Elminster is not alive anymore, tragically." });

    const suggestions = checkConsistency([elminster, existing], "elminster", candidate, new HeuristicContradictionFlagger());
    expect(suggestions.map((s) => s.factId)).toEqual(["f1"]);
  });
});
