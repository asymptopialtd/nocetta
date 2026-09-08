import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReverseIndex, filenameFor, readAll, writeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-store-"));
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
    body: "a claim about the code",
    ...overrides,
  };
}

describe("file store", () => {
  it("reconstructs the full graph + reverse index from files alone", () => {
    const a: MemoryNode = node({
      id: "a",
      kind: "claim",
      anchors: [{ locator: "src/foo.ts › function foo", hash: "h1", artifactPath: "src/foo.ts" }],
      edges: [{ type: "anchored-to", target: "src/foo.ts" }],
      body: "foo returns 1",
    });
    const b: MemoryNode = node({
      id: "b",
      kind: "value",
      anchors: [],
      edges: [{ type: "supersedes", target: "a" }],
      authority: "invariant",
      body: "we prefer immutable data structures",
    });
    const c: MemoryNode = node({
      id: "c",
      kind: "claim",
      anchors: [
        { locator: "src/foo.ts › function foo", hash: "h1", artifactPath: "src/foo.ts" },
        { locator: "src/bar.ts › class Bar", hash: "h2", artifactPath: "src/bar.ts" },
      ],
      body: "foo and Bar are related",
    });

    for (const n of [a, b, c]) writeNode(dir, n);

    // Simulate a fresh process: no in-memory state survives, only files.
    const rebuilt = readAll(dir);
    expect(rebuilt).toEqual([a, b, c].sort((x, y) => x.id.localeCompare(y.id)));

    const index = buildReverseIndex(rebuilt);
    expect(index.get("src/foo.ts")).toEqual(new Set(["a", "c"]));
    expect(index.get("src/bar.ts")).toEqual(new Set(["c"]));
    expect(index.has("src/nonexistent.ts")).toBe(false);
  });

  it("round-trips null fields, edges, and multiline bodies exactly", () => {
    const n: MemoryNode = node({
      id: "roundtrip",
      validTo: "2026-06-01T00:00:00.000Z",
      overrideReason: "superseded by newer benchmark",
      body: "line one\nline two\n\nline four (blank line above)",
      edges: [
        { type: "superseded-by", target: "z" },
        { type: "restates", target: "y" },
      ],
    });
    writeNode(dir, n);
    const [readBack] = readAll(dir);
    expect(readBack).toEqual(n);
  });

  it("returns an empty graph and index when the directory does not exist", () => {
    const missing = join(dir, "does-not-exist");
    expect(readAll(missing)).toEqual([]);
    expect(buildReverseIndex(readAll(missing)).size).toBe(0);
  });

  it("names files <slug>--<id8>.md — readable in ls/git log, unique, traceable to the id", () => {
    const n: MemoryNode = node({ id: "7e265cdb-e39e-4fc3-8a0c-1484f9c60189", body: "Every memory write routes through writeNode" });
    expect(filenameFor(n)).toBe("every-memory-write-routes-through-writenode--7e265cdb.md");

    writeNode(dir, n);
    expect(readdirSync(dir)).toEqual([filenameFor(n)]);
    expect(readAll(dir)[0]!.id).toBe(n.id); // identity lives in frontmatter, not the name
  });

  it("falls back to a stable name when the body yields no slug (non-latin text)", () => {
    const n: MemoryNode = node({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeffff0000", body: "记忆系统存储代码事实" });
    expect(filenameFor(n)).toBe("memory--aaaaaaaa.md");
  });
});
