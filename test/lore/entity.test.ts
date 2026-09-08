import { describe, expect, it } from "vitest";
import { findReferences, goToDefinition, renameEntity } from "../../src/lore/entity.js";
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

function entity(id: string, canonicalName: string, aliases: string[] = []): MemoryNode {
  return node({ id, kind: "entity", body: canonicalName, aliases });
}

describe("findReferences", () => {
  it("finds nodes mentioning the entity by canonical name or alias", () => {
    const elminster = entity("e1", "Elminster Aumar", ["Elminster", "The Old Mage"]);
    const factA = node({ id: "f1", body: "Elminster lives in Shadowdale." });
    const factB = node({ id: "f2", body: "The Old Mage is famously eccentric." });
    const factC = node({ id: "f3", body: "Mystra is the goddess of magic." }); // no mention
    const refs = findReferences([elminster, factA, factB, factC], "e1");
    expect(refs.map((n) => n.id).sort()).toEqual(["f1", "f2"]);
  });

  it("does not match a substring inside a longer word", () => {
    const mystra = entity("e1", "Myst");
    const factA = node({ id: "f1", body: "Mystra is unrelated to Myst the word." }); // "Myst" matches only the word-boundary occurrence
    const refs = findReferences([mystra, factA], "e1");
    expect(refs.map((n) => n.id)).toEqual(["f1"]); // "Myst the word" is a real word-boundary hit
  });

  it("throws for an unknown or non-entity id", () => {
    const claim = node({ id: "c1", kind: "claim" });
    expect(() => findReferences([claim], "c1")).toThrow(/unknown entity/);
    expect(() => findReferences([claim], "missing")).toThrow(/unknown entity/);
  });
});

describe("goToDefinition", () => {
  it("resolves by canonical name or by alias", () => {
    const elminster = entity("e1", "Elminster Aumar", ["Elminster"]);
    const nodes = [elminster];
    expect(goToDefinition(nodes, "Elminster Aumar")?.id).toBe("e1");
    expect(goToDefinition(nodes, "Elminster")?.id).toBe("e1");
    expect(goToDefinition(nodes, "elminster")?.id).toBe("e1"); // case-insensitive
    expect(goToDefinition(nodes, "Nobody")).toBeUndefined();
  });

  it("resolves through a rename to the current (tip) entity node", () => {
    const original = entity("e1", "Elminster");
    const renamed = entity("e2", "Elminster Aumar");
    const { old, next } = renameEntity([original], "e1", renamed);
    const nodes = [old, next];

    // both the old and new canonical names now resolve to the tip.
    expect(goToDefinition(nodes, "Elminster")?.id).toBe("e2");
    expect(goToDefinition(nodes, "Elminster Aumar")?.id).toBe("e2");
  });
});

describe("renameEntity", () => {
  it("supersedes rather than mutates, carrying the old name forward as an alias", () => {
    const original = entity("e1", "Elminster", ["Old Man Elminster"]);
    const renamed = entity("e2", "Elminster Aumar");
    const { old, next } = renameEntity([original], "e1", renamed);

    expect(old.edges).toContainEqual({ type: "superseded-by", target: "e2" });
    expect(next.body).toBe("Elminster Aumar");
    expect(next.aliases).toEqual(expect.arrayContaining(["Elminster", "Old Man Elminster"]));

    // existing references under the old name still resolve after the rename.
    const oldFact = node({ id: "f1", body: "Elminster taught many apprentices." });
    const refs = findReferences([old, next, oldFact], "e2");
    expect(refs.map((n) => n.id)).toEqual(["f1"]);
  });

  it("rejects renaming a non-entity node", () => {
    const claim = node({ id: "c1", kind: "claim" });
    expect(() => renameEntity([claim], "c1", entity("e2", "New Name"))).toThrow(/not an entity/);
  });
});
