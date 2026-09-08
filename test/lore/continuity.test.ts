import { describe, expect, it } from "vitest";
import { extractContentSpans } from "../../src/anchor/content.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { check } from "../../src/drift/check.js";
import { continuityWorklist } from "../../src/lore/continuity.js";
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

/**
 * Slice 8b headline demo: superseding a lore-fact produces a "continuity
 * worklist" of dependent memories to re-check — a signal Slice 3's
 * code/content-drift check() is structurally blind to, because nothing in
 * any file changed; only the graph's belief did.
 */
describe("continuity worklist (retcon demo)", () => {
  const LORE_PATH = "lore/mage.md";
  const loreSource = `# Elminster

Elminster is a powerful archmage who lives in Shadowdale.
`;
  const loreSpan = extractContentSpans(LORE_PATH, loreSource).find((s) => s.heading === "Elminster")!;

  it("supersede(locationFact) -> the chronicle that depended on it is in the worklist; unrelated lore is not", () => {
    const elminster = node({ id: "elminster", kind: "entity", body: "Elminster Aumar", aliases: ["Elminster"] });

    const locationFactOld = node({
      id: "location-v1",
      body: "Elminster lives in Shadowdale.",
      anchors: [{ locator: loreSpan.path, hash: loreSpan.hash, artifactPath: LORE_PATH }],
      edges: [{ type: "anchored-to", target: "elminster" }],
    });

    // A dependent memory that was written *assuming* the old location fact.
    const chronicle = node({
      id: "chronicle1",
      body: "The chronicle describes Elminster's tower and its wards in loving detail.",
      edges: [{ type: "anchored-to", target: "location-v1" }],
    });

    // An unrelated lore-fact that must never show up in this worklist.
    const unrelated = node({ id: "unrelated1", body: "Mystra is the goddess of magic." });

    const baseNodes = [elminster, locationFactOld, chronicle, unrelated];

    const repoState = repoStateFromFiles({ [LORE_PATH]: loreSource });
    // Before the retcon: nothing is dirty, chronicle included — check() has
    // no way to know chronicle depends on a *belief*, not a code/content hash.
    expect(check(baseNodes, repoState).dirty.size).toBe(0);

    const { old, next } = supersede(
      [locationFactOld],
      "location-v1",
      node({ id: "location-v2", body: "Elminster relocated to Waterdeep after the Spellplague." }),
    );
    const allNodes = [elminster, old, next, chronicle, unrelated];

    // The retcon is invisible to check(): the markdown file on disk never
    // changed, so the old lore-fact's own anchor still resolves cleanly.
    expect(check(allNodes, repoState).dirty.size).toBe(0);

    // But the continuity worklist catches it: chronicle depended on the
    // fact that just got superseded.
    const worklist = continuityWorklist(allNodes, "location-v1");
    expect(worklist.map((n) => n.id)).toEqual(["chronicle1"]);
    expect(worklist.map((n) => n.id)).not.toContain("unrelated1");
    expect(worklist.map((n) => n.id)).not.toContain("elminster");
  });

  it("an empty worklist when nothing depended on the superseded node", () => {
    const lone = node({ id: "lone-v1", body: "a fact nobody built on top of" });
    const { old, next } = supersede([lone], "lone-v1", node({ id: "lone-v2", body: "an updated fact" }));
    expect(continuityWorklist([old, next], "lone-v1")).toEqual([]);
  });
});
