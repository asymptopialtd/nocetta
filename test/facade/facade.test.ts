import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";
import { loadRepoState, MEMORY_DIR, open } from "../../src/facade/index.js";
import { filenameFor, serializeNode, writeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

/**
 * Seam 2: the `open()` facade + repo-state loader, exercised against a real
 * fixture repo (source files on disk, the store written through the real
 * choke-point). The property under test: one object hosts the whole loop —
 * capture, recall, drift, history — with no hand-wired
 * readAll/repoStateFromFiles/check plumbing, and loadRepoState touches
 * exactly the anchored file set, nothing more.
 */

const FOO_PATH = "src/foo.ts";

const FOO_V0 = `export function foo(): number {
  return 1;
}

export function bar(): string {
  return "bar";
}
`;

// A real body edit to foo only; bar is the drift-precision control.
const FOO_EDITED = FOO_V0.replace("return 1;", "return 42;");
const BOTH_EDITED = FOO_V0.replace("return 1;", "return 42;").replace('return "bar";', 'return "BAR";');

const NOTE_PATH = "docs/note.md";

const NOTE_MD = `# Setup

Install dependencies first.

# Deployment

Ship on Fridays.
`;

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "nocetta-facade-"));
  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, FOO_PATH), FOO_V0, "utf8");
  mkdirSync(join(repoRoot, "docs"), { recursive: true });
  writeFileSync(join(repoRoot, NOTE_PATH), NOTE_MD, "utf8");
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function anchorFor(filePath: string, source: string, path: string): Anchor {
  const symbol = extractSymbols(filePath, source).find((s) => s.path === path);
  if (!symbol) throw new Error(`fixture bug: no symbol at ${path}`);
  return { locator: symbol.path, hash: symbol.hash, artifactPath: filePath };
}

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

function seed(nodes: MemoryNode[]): void {
  const memoryDir = join(repoRoot, MEMORY_DIR);
  for (const n of nodes) writeNode(memoryDir, n);
}

describe("open() facade + loadRepoState (Seam 2)", () => {
  it("search: filesInPlay finds the anchored claim; keyword finds the value", () => {
    seed([
      node({
        id: "claim-1",
        anchors: [anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function foo`)],
        body: "foo returns 1",
      }),
      node({ id: "value-1", kind: "value", body: "we always ship on fridays" }),
    ]);
    const nc = open(repoRoot);

    expect(nc.search({ filesInPlay: [FOO_PATH] }).map((r) => r.node.id)).toEqual(["claim-1"]);
    expect(nc.search({ filesInPlay: [], keyword: "ship fridays" }).map((r) => r.node.id)).toEqual(["value-1"]);
  });

  it("contextTrigger surfaces live anchored memories across the open file set — and drops a drifted one", () => {
    const nc = open(repoRoot);
    const claim = nc.remember({ body: "foo returns the number one", kind: "claim", artifactPath: FOO_PATH, symbolName: "foo" });
    const lore = nc.remember({ body: "deploys happen on fridays", kind: "lore-fact", artifactPath: NOTE_PATH, heading: "Deployment" });

    const results = nc.contextTrigger([FOO_PATH, NOTE_PATH]);
    expect(results.map((r) => r.node.id).sort()).toEqual([claim.node.id, lore.node.id].sort());

    // foo's body changes on disk: its claim is no longer live, the untouched
    // heading anchor still is.
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");
    expect(nc.contextTrigger([FOO_PATH, NOTE_PATH]).map((r) => r.node.id)).toEqual([lore.node.id]);
  });

  it("remember resolves the anchor from the real fixture file, persists under .nocetta/memory, and needs no manual reload", () => {
    const nc = open(repoRoot);
    const { node, superseded, warnings } = nc.remember({
      body: "foo returns the number one",
      kind: "claim",
      artifactPath: FOO_PATH,
      symbolName: "foo",
    });

    expect(superseded).toBeNull();
    expect(warnings).toEqual([]);
    const expected = extractSymbols(FOO_PATH, FOO_V0).find((s) => s.name === "foo")!;
    expect(node.anchors).toEqual([{ locator: `${FOO_PATH} › function foo`, hash: expected.hash, artifactPath: FOO_PATH }]);

    // The canonical layout, pinned literally: <repoRoot>/.nocetta/memory/<slug>--<id8>.md
    const storeDir = join(repoRoot, ".nocetta", "memory");
    expect(MEMORY_DIR).toBe(".nocetta/memory");
    expect(existsSync(join(storeDir, filenameFor(node)))).toBe(true);

    // The in-memory fold is current without a manual reload.
    expect(nc.nodes()).toEqual([node]);
  });

  it("supersede persists both nodes, closes the old, and search resolves to the tip", () => {
    const nc = open(repoRoot);
    const v1 = nc.remember({ body: "foo returns one", kind: "claim", artifactPath: FOO_PATH, symbolName: "foo" }).node;

    const { old, next } = nc.supersede(v1.id, node({ id: "v2-tip", anchors: v1.anchors, body: "foo returns the number one" }));

    expect(old.id).toBe(v1.id);
    expect(old.validTo).not.toBeNull();
    expect(old.edges).toContainEqual({ type: "superseded-by", target: "v2-tip" });
    expect(next.edges).toContainEqual({ type: "supersedes", target: v1.id });

    const memoryDir = join(repoRoot, MEMORY_DIR);
    expect(existsSync(join(memoryDir, filenameFor(old)))).toBe(true);
    expect(existsSync(join(memoryDir, filenameFor(next)))).toBe(true);

    // a superseded node is never served as current: the tip replaces it
    expect(nc.search({ filesInPlay: [FOO_PATH] }).map((r) => r.node.id)).toEqual(["v2-tip"]);
    expect(nc.nodes().map((n) => n.id).sort()).toEqual([v1.id, "v2-tip"].sort());
  });

  it("override stamps the mandatory reason, closes the old value, and resolves to the new tip", () => {
    seed([node({ id: "old-val", kind: "value", scope: "deploys", body: "we deploy on fridays" })]);
    const nc = open(repoRoot);

    const { old, next } = nc.override(
      "old-val",
      node({ id: "new-val", kind: "value", scope: "deploys", body: "we deploy on tuesdays" }),
      "deploy windows moved to tuesdays",
      { now: "2026-06-01T00:00:00.000Z" },
    );

    expect(next.overrideReason).toBe("deploy windows moved to tuesdays");
    expect(old.edges).toContainEqual({ type: "superseded-by", target: "new-val" });
    expect(old.validTo).toBe("2026-06-01T00:00:00.000Z");
    expect(existsSync(join(repoRoot, MEMORY_DIR, filenameFor(next)))).toBe(true);

    // keyword recall resolves the chain to the new tip, not the overridden old
    expect(nc.search({ filesInPlay: [], keyword: "deploy" }).map((r) => r.node.id)).toEqual(["new-val"]);
  });

  it("worklist flags the edited anchor with its hash-changed reason — and only the drifted node", () => {
    seed([
      node({ id: "claim-foo", anchors: [anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function foo`)], body: "foo returns 1" }),
      node({ id: "claim-bar", anchors: [anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function bar`)], body: `bar returns "bar"` }),
    ]);
    const nc = open(repoRoot);

    // the fixture function's body changes on disk; the store is untouched
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const { dirty, conflicts } = nc.worklist();
    expect(dirty.map((d) => d.node.id)).toEqual(["claim-foo"]);
    expect(dirty[0]!.reason).toMatch(/hash changed/);
    expect(conflicts).toEqual([]);
  });

  it("worklist sorts dirty deterministically by node id", () => {
    seed([
      node({ id: "b-claim", anchors: [anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function foo`)], body: "foo returns 1" }),
      node({ id: "a-claim", anchors: [anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function bar`)], body: "bar returns bar" }),
    ]);
    const nc = open(repoRoot);
    writeFileSync(join(repoRoot, FOO_PATH), BOTH_EDITED, "utf8");

    expect(nc.worklist().dirty.map((d) => d.node.id)).toEqual(["a-claim", "b-claim"]);
  });

  it("worklist surfaces a cross-authority same-subject pair as a conflict", () => {
    seed([
      node({ id: "inv", kind: "value", scope: "deploys", authority: "invariant", body: "we never deploy on fridays" }),
      node({ id: "def", kind: "value", scope: "deploys", authority: "default", body: "we ship on fridays" }),
    ]);
    const nc = open(repoRoot);

    const { dirty, conflicts } = nc.worklist();
    expect(dirty).toEqual([]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.invariantNode.id).toBe("inv");
    expect(conflicts[0]!.defaultNode.id).toBe("def");
  });

  it("reAnchor repairs the drifted anchor in place through the facade — cache current without a manual reload", () => {
    const nc = open(repoRoot);
    const { node: captured } = nc.remember({ body: "foo returns 1", kind: "claim", artifactPath: FOO_PATH, symbolName: "foo" });

    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");
    expect(nc.worklist().dirty.map((d) => d.node.id)).toEqual([captured.id]);

    const repaired = nc.reAnchor(captured.id, { symbolName: "foo" });
    const fresh = extractSymbols(FOO_PATH, FOO_EDITED).find((s) => s.name === "foo")!;
    expect(repaired.anchors).toEqual([{ locator: `${FOO_PATH} › function foo`, hash: fresh.hash, artifactPath: FOO_PATH }]);
    // identity repair only: the belief and its temporal state are the old ones
    expect(repaired.body).toBe(captured.body);
    expect(repaired.validFrom).toBe(captured.validFrom);
    expect(repaired.validTo).toBe(captured.validTo);

    // the fold was rebuilt by the mutation itself: no reload() in sight, and
    // the worklist the drift opened is closed
    expect(nc.nodes()).toEqual([repaired]);
    expect(nc.worklist().dirty).toEqual([]);
  });

  it("retire closes the node in place through the facade: out of current, still visible to asOf, cache current", () => {
    const nc = open(repoRoot);
    const { node: captured } = nc.remember({ body: "foo returns the number one", kind: "claim", artifactPath: FOO_PATH, symbolName: "foo" });

    const retired = nc.retire(captured.id, "foo is gone; the claim has no subject");
    expect(retired.retiredReason).toBe("foo is gone; the claim has no subject");
    expect(retired.validTo).not.toBeNull();
    expect(nc.nodes()).toEqual([retired]);

    expect(nc.search({ filesInPlay: [FOO_PATH] })).toEqual([]);
    expect(nc.asOf("2027-01-01T00:00:00.000Z").map((n) => n.id)).toEqual([captured.id]);
  });

  it("loadRepoState reads exactly the anchored set — no extras — and missing artifacts stay absent", () => {
    const claim = node({
      id: "claim-1",
      anchors: [
        anchorFor(FOO_PATH, FOO_V0, `${FOO_PATH} › function foo`),
        { locator: "src/gone.ts › function gone", hash: "stale", artifactPath: "src/gone.ts" },
      ],
    });
    const value = node({ id: "value-1", kind: "value", body: "we ship on fridays" });

    const state = loadRepoState(repoRoot, [claim, value]);

    // docs/note.md exists but is unanchored: never read. src/gone.ts is
    // anchored but missing: absent, so check() reports it honestly.
    expect([...state.keys()].sort()).toEqual([FOO_PATH]);
    expect(state.get(FOO_PATH)).toBe(FOO_V0);
  });

  it("reload picks up externally written nodes — reads are explicit, there are no watchers", () => {
    const nc = open(repoRoot); // no store on disk yet
    expect(nc.nodes()).toEqual([]);

    writeNode(join(repoRoot, MEMORY_DIR), node({ id: "external-1", body: "written behind the facade's back" }));

    expect(nc.nodes().map((n) => n.id)).toEqual([]); // stale until told
    nc.reload();
    expect(nc.nodes().map((n) => n.id)).toEqual(["external-1"]);
  });

  it("a hand-corrupted file quarantines: good nodes still serve, issues name exactly the bad file, and a fix + reload clears it", () => {
    seed([node({ id: "good-1", body: "a healthy claim" })]);
    const memoryDir = join(repoRoot, MEMORY_DIR);
    writeFileSync(join(memoryDir, "broken--abc123.md"), "not frontmatter at all\n", "utf8");
    const nc = open(repoRoot);

    // the bad file never takes the query surface down
    expect(nc.nodes().map((n) => n.id)).toEqual(["good-1"]);
    const issues = nc.issues();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.file).toBe("broken--abc123.md");
    expect(issues[0]!.reason).toMatch(/frontmatter/);

    // the human repairs the file on disk; a reload re-reads it as a good node
    writeFileSync(join(memoryDir, "broken--abc123.md"), serializeNode(node({ id: "repaired-1", body: "fixed by hand" })), "utf8");
    nc.reload();
    expect(nc.issues()).toEqual([]);
    expect(nc.nodes().map((n) => n.id).sort()).toEqual(["good-1", "repaired-1"]);
  });

  it("asOf returns the belief the store held at a transaction time", () => {
    const a: MemoryNode = node({ id: "a", txnTime: "2026-01-01T00:00:00.000Z", body: "the old belief" });
    const closedA: MemoryNode = { ...a, edges: [{ type: "superseded-by", target: "b" }], validTo: "2026-02-01T00:00:00.000Z" };
    const b: MemoryNode = node({
      id: "b",
      txnTime: "2026-02-01T00:00:00.000Z",
      edges: [{ type: "supersedes", target: "a" }],
      body: "the new belief",
    });
    seed([closedA, b]);
    const nc = open(repoRoot);

    expect(nc.asOf("2026-01-15T00:00:00.000Z").map((n) => n.id)).toEqual(["a"]);
    expect(nc.asOf("2026-03-01T00:00:00.000Z").map((n) => n.id)).toEqual(["b"]);
  });
});
