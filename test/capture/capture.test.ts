import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractContentSpans, extractSymbols } from "../../src/anchor/index.js";
import { createNode, remember } from "../../src/capture/index.js";
import { check } from "../../src/drift/check.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { resolveToTip } from "../../src/retrieval/pipeline.js";
import { NeverLeakError, filenameFor, parseNode, readAll, serializeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

const NOW = "2026-06-01T00:00:00.000Z";

const TS_SOURCE = `export function foo(): number {
  return 1;
}

export function bar(): string {
  return "bar";
}
`;

// Two same-named top-level functions: the locator format cannot tell them
// apart, so capture must refuse rather than pick.
const AMBIGUOUS_TS_SOURCE = `export function foo(): number {
  return 1;
}

export function foo(s: string): string {
  return s;
}
`;

const MD_SOURCE = `# Elminster

Elminster is a powerful archmage who lives in Shadowdale.

# Mystra

Mystra is the goddess of magic.
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-capture-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

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
    body: "a seeded memory",
    ...overrides,
  };
}

describe("createNode", () => {
  it("fills every unset field with the store-wide defaults, version stamped 1", () => {
    const n = createNode({ kind: "claim", body: "a fact about foo" });
    expect(n.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(n.scope).toBe("global");
    expect(n.anchors).toEqual([]);
    expect(n.edges).toEqual([]);
    expect(n.validTo).toBeNull();
    expect(n.authority).toBe("default");
    expect(n.overrideReason).toBeNull();
    expect(n.version).toBe(1);
    expect(n.validFrom).toBe(n.txnTime); // one construction, one moment
    expect(Number.isNaN(Date.parse(n.txnTime))).toBe(false);
  });

  it("lets explicit partial values win over every default", () => {
    const n = createNode({
      kind: "value",
      body: "we use parameterized SQL",
      id: "fixed-id",
      scope: "core",
      authority: "invariant",
      validFrom: "2020-01-01T00:00:00.000Z",
      txnTime: "2020-01-01T00:00:00.000Z",
      anchors: [{ locator: "src/db.ts › function query", hash: "h", artifactPath: "src/db.ts" }],
      edges: [{ type: "supersedes", target: "old" }],
      version: 2,
    });
    expect(n).toMatchObject({
      id: "fixed-id",
      scope: "core",
      authority: "invariant",
      validFrom: "2020-01-01T00:00:00.000Z",
      txnTime: "2020-01-01T00:00:00.000Z",
      anchors: [{ locator: "src/db.ts › function query", artifactPath: "src/db.ts" }],
      edges: [{ type: "supersedes", target: "old" }],
      version: 2,
    });
  });

  it("round-trips version through serialize/parse with no frontmatter special-casing", () => {
    const n = createNode({ kind: "claim", body: "b" });
    expect(parseNode(serializeNode(n))).toEqual(n);
  });

  it("derives a fallback summary from the body's first sentence when none is given", () => {
    const n = createNode({ kind: "claim", body: "foo returns 1. Some more detail follows here." });
    expect(n.summary).toBe("foo returns 1.");
  });

  it("derives a fallback summary from the first line when the body has no sentence-ending punctuation", () => {
    const n = createNode({ kind: "claim", body: "foo returns 1\nsome more detail follows here" });
    expect(n.summary).toBe("foo returns 1");
  });

  it("caps the derived summary to ~120 chars with an ellipsis marker", () => {
    const longSentence = `${"a".repeat(150)}.`;
    const n = createNode({ kind: "claim", body: longSentence });
    expect(n.summary!.length).toBeLessThanOrEqual(120);
    expect(n.summary!.endsWith("…")).toBe(true);
  });

  it("lets an explicit summary win over the derived fallback", () => {
    const n = createNode({ kind: "claim", body: "foo returns 1. detail.", summary: "foo returns one" });
    expect(n.summary).toBe("foo returns one");
  });

  it("round-trips summary through serialize/parse alongside the other optional fields", () => {
    const n = createNode({ kind: "claim", body: "b", summary: "a one-liner" });
    expect(parseNode(serializeNode(n))).toEqual(n);
  });
});

describe("remember", () => {
  it("resolves a code anchor from the artifact's real source and persists through writeNode", () => {
    const result = remember(
      dir,
      [],
      { body: "foo returns 1", kind: "claim", artifactPath: "src/foo.ts", symbolName: "foo" },
      { readArtifact: (p) => (p === "src/foo.ts" ? TS_SOURCE : undefined), now: NOW },
    );

    const expected = extractSymbols("src/foo.ts", TS_SOURCE).find((s) => s.name === "foo")!;
    expect(result.node.anchors).toEqual([
      { locator: "src/foo.ts › function foo", hash: expected.hash, artifactPath: "src/foo.ts" },
    ]);
    expect(result.node.validFrom).toBe(NOW);
    expect(result.node.txnTime).toBe(NOW);
    expect(result.superseded).toBeNull();
    expect(result.warnings).toEqual([]);

    // Files are truth: the node exists on disk and round-trips through parse
    // alone, version included.
    expect(existsSync(join(dir, filenameFor(result.node)))).toBe(true);
    const [onDisk] = readAll(dir);
    expect(onDisk).toEqual(result.node);
    expect(onDisk!.version).toBe(1);
  });

  it("resolves a code anchor to a non-exported top-level const", () => {
    const source = `const INTERNAL_LIMIT = 10;\n\nexport function useIt(): number {\n  return INTERNAL_LIMIT;\n}\n`;
    const result = remember(
      dir,
      [],
      { body: "INTERNAL_LIMIT caps the internal batch size", kind: "claim", artifactPath: "src/internal.ts", symbolName: "INTERNAL_LIMIT" },
      { readArtifact: (p) => (p === "src/internal.ts" ? source : undefined), now: NOW },
    );
    expect(result.node.anchors).toEqual([
      { locator: "src/internal.ts › const INTERNAL_LIMIT", hash: expect.any(String), artifactPath: "src/internal.ts" },
    ]);
  });

  it("stores an optional commit field, round-tripped through the choke-point", () => {
    const result = remember(
      dir,
      [],
      { body: "foo returns 1", kind: "claim", commit: "abc1234" },
      { now: NOW },
    );
    expect(result.node.commit).toBe("abc1234");
    const [onDisk] = readAll(dir);
    expect(onDisk!.commit).toBe("abc1234");
  });

  it("resolves a heading anchor: .md artifacts route to the content-span extractor", () => {
    const result = remember(
      dir,
      [],
      { body: "Elminster lives in Shadowdale", kind: "lore-fact", artifactPath: "lore/mage.md", heading: "Elminster" },
      { readArtifact: (p) => (p === "lore/mage.md" ? MD_SOURCE : undefined), now: NOW },
    );

    const expected = extractContentSpans("lore/mage.md", MD_SOURCE).find((s) => s.heading === "Elminster")!;
    expect(result.node.anchors).toEqual([
      { locator: "lore/mage.md#Elminster", hash: expected.hash, artifactPath: "lore/mage.md" },
    ]);
    expect(existsSync(join(dir, filenameFor(result.node)))).toBe(true);
  });

  it("refuses an unknown symbol name, listing the available ones — nothing written", () => {
    const call = () =>
      remember(
        dir,
        [],
        { body: "x", kind: "claim", artifactPath: "src/foo.ts", symbolName: "baz" },
        { readArtifact: (p) => (p === "src/foo.ts" ? TS_SOURCE : undefined), now: NOW },
      );
    expect(call).toThrow(/no symbol named "baz" in "src\/foo\.ts" — available symbols: foo, bar/);
    expect(readAll(dir)).toEqual([]);
  });

  it("refuses an ambiguous symbol name, listing every candidate locator", () => {
    const call = () =>
      remember(
        dir,
        [],
        { body: "x", kind: "claim", artifactPath: "src/ambig.ts", symbolName: "foo" },
        { readArtifact: (p) => (p === "src/ambig.ts" ? AMBIGUOUS_TS_SOURCE : undefined), now: NOW },
      );
    expect(call).toThrow(/ambiguous in "src\/ambig\.ts".*src\/ambig\.ts › function foo; src\/ambig\.ts › function foo/);
    expect(readAll(dir)).toEqual([]);
  });

  it("refuses when the artifact source cannot be read", () => {
    const call = () =>
      remember(
        dir,
        [],
        { body: "x", kind: "claim", artifactPath: "src/gone.ts", symbolName: "foo" },
        { readArtifact: () => undefined, now: NOW },
      );
    expect(call).toThrow(/could not read artifact "src\/gone\.ts"/);
    expect(readAll(dir)).toEqual([]);
  });

  it("rejects malformed requests before any resolution or write", () => {
    const opts = { now: NOW };
    expect(() => remember(dir, [], { body: "  \n  ", kind: "claim" }, opts)).toThrow(/non-empty/);
    expect(() => remember(dir, [], { body: "x", kind: "claim", symbolName: "foo", heading: "Foo" }, opts)).toThrow(
      /mutually exclusive/,
    );
    expect(() => remember(dir, [], { body: "x", kind: "claim", symbolName: "foo" }, opts)).toThrow(
      /artifactPath is required/,
    );
    expect(() => remember(dir, [], { body: "x", kind: "claim", artifactPath: "src/foo.ts" }, opts)).toThrow(
      /anchors nothing/,
    );
    expect(() => remember(dir, [], { body: "x", kind: "entity", artifactPath: "src/foo.ts", symbolName: "foo" }, opts)).toThrow(
      /unanchored/,
    );
    expect(readAll(dir)).toEqual([]);
  });

  it("never-leak still gates at the choke-point: a secret body throws NeverLeakError and nothing is written", () => {
    expect(() =>
      remember(dir, [], { body: "the fix was:\nDATABASE_PASSWORD=hunter2superlong", kind: "claim" }, { now: NOW }),
    ).toThrow(NeverLeakError);
    expect(readAll(dir)).toEqual([]);
  });

  it("capture-as-supersession: old node edges forward and closes, resolveToTip maps old to the new node", () => {
    const old = node({ id: "old", authority: "invariant", body: "the old belief" });
    const result = remember(dir, [old], { body: "the new belief", kind: "claim", supersedes: "old" }, { now: NOW });

    expect(result.superseded).not.toBeNull();
    expect(result.superseded!.id).toBe("old");
    expect(result.warnings).toEqual([]); // related by supersession — never self-flagged

    const onDisk = readAll(dir);
    const oldOnDisk = onDisk.find((n) => n.id === "old")!;
    const newOnDisk = onDisk.find((n) => n.id === result.node.id)!;
    expect(oldOnDisk.edges).toContainEqual({ type: "superseded-by", target: result.node.id });
    expect(oldOnDisk.validTo).toBe(NOW);
    expect(newOnDisk.edges).toContainEqual({ type: "supersedes", target: "old" });
    expect(newOnDisk.validFrom).toBe(NOW);

    // the whole point: a superseded node never resolves as current again
    const byId = new Map(onDisk.map((n) => [n.id, n]));
    const tip = resolveToTip([{ node: oldOnDisk, matchedFiles: new Set() }], byId);
    expect(tip).toHaveLength(1);
    expect(tip[0]!.node.id).toBe(result.node.id);
  });

  it("captures a live claim: editing the anchored symbol dirties it, editing elsewhere does not", () => {
    const result = remember(
      dir,
      [],
      { body: "foo returns 1", kind: "claim", artifactPath: "src/foo.ts", symbolName: "foo" },
      { readArtifact: (p) => (p === "src/foo.ts" ? TS_SOURCE : undefined), now: NOW },
    );

    // Same source: live. Foo's body edited: dirty. Bar's body edited: still
    // live — the anchor pins foo, not the file.
    const repo = (src: string) => repoStateFromFiles({ "src/foo.ts": src });
    const live = check([result.node], repo(TS_SOURCE));
    expect(live.dirty.has(result.node.id)).toBe(false);

    const fooEdited = TS_SOURCE.replace("return 1;", "return 42;");
    const drifted = check([result.node], repo(fooEdited));
    expect(drifted.dirty.has(result.node.id)).toBe(true);
    expect(drifted.reasons.get(result.node.id)).toMatch(/hash changed/);

    const barEdited = TS_SOURCE.replace('return "bar";', 'return "BAR";');
    const untouched = check([result.node], repo(barEdited));
    expect(untouched.dirty.has(result.node.id)).toBe(false);
  });

  it("surfaces cross-authority conflicts as warnings — advisory, the node is still written", () => {
    const invariant = node({
      id: "inv",
      kind: "value",
      scope: "team",
      authority: "invariant",
      body: "all SQL is parameterized, always",
    });
    // Same subject on purpose (shared vocabulary "sql"): the advisory must
    // fire for a genuine same-topic disagreement. Unrelated-topic pairs —
    // scope shared, vocabulary not — are the noise the gate exists to remove.
    const result = remember(
      dir,
      [invariant],
      { body: "string concatenation is fine for building this one SQL fragment", kind: "value", scope: "team", authority: "default" },
      { now: NOW },
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"inv"');
    expect(result.warnings[0]).toContain("scope:team");
    expect(readAll(dir).map((n) => n.id)).toContain(result.node.id);
  });
});
