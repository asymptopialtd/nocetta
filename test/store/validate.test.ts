import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStore, parseNode, serializeNode, validateNode, writeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

/**
 * Seam 3: reads survive bad files. Files are truth, so hand-edits are the
 * norm — the property under test: a malformed file quarantines with a readable
 * reason (file NAME + the actual problem) while the rest of the store reads;
 * nothing is thrown, nothing is deleted.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-validate-"));
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
    version: 1,
    body: "a claim about the code",
    ...overrides,
  };
}

// One well-formed node carrying every structured feature (anchor + edge), so
// each corruption is a single surgical string edit away from valid bytes.
const GOOD_RAW = serializeNode(
  node({
    id: "abcd1234-0000-0000-0000-000000000001",
    anchors: [{ locator: "src/foo.ts › function foo", hash: "h1", artifactPath: "src/foo.ts" }],
    edges: [{ type: "anchored-to", target: "src/foo.ts" }],
    body: "foo returns 1",
  }),
);

function plantCorrupt(name: string, raw: string, reasonPattern: RegExp): void {
  it(`quarantines ${name} with a readable reason; the good nodes still read`, () => {
    const good = node({ id: "good-1", body: "an untouched claim" });
    writeNode(dir, good);
    writeFileSync(join(dir, "broken--abc123.md"), raw, "utf8");

    const { nodes, issues } = readStore(dir);

    expect(nodes).toEqual([good]);
    expect(issues).toEqual([{ file: "broken--abc123.md", reason: expect.stringMatching(reasonPattern) }]);
  });
}

describe("validated reads with quarantine (Seam 3)", () => {
  it("reads a well-formed store with zero issues and nodes identical to input", () => {
    const nodes = [
      node({ id: "b", body: "sorted after a" }),
      node({
        id: "a",
        kind: "entity",
        aliases: ["Foo", "TheFoo"],
        anchors: [{ locator: "src/foo.ts › class Foo", hash: "h1", artifactPath: "src/foo.ts" }],
        edges: [{ type: "restates", target: "b" }],
        body: "Foo",
      }),
    ];
    for (const n of nodes) writeNode(dir, n);

    const read = readStore(dir);
    expect(read.issues).toEqual([]);
    expect(read.nodes).toEqual([...nodes].sort((x, y) => x.id.localeCompare(y.id)));
  });

  plantCorrupt(
    "a truncated file (no closing delimiter)",
    GOOD_RAW.slice(0, GOOD_RAW.indexOf("---", 1)),
    /missing closing frontmatter delimiter/,
  );

  plantCorrupt(
    "invalid YAML",
    GOOD_RAW.replace("scope: global", "scope: [unclosed"),
    /missed comma between flow collection entries/,
  );

  plantCorrupt("an unknown kind", GOOD_RAW.replace("kind: claim", 'kind: "decision"'), /unknown kind: "decision"/);

  plantCorrupt(
    "an unknown authority",
    GOOD_RAW.replace("authority: default", "authority: mandatory"),
    /unknown authority: "mandatory"/,
  );

  plantCorrupt("a missing id", GOOD_RAW.replace(/^id: .*\n/m, ""), /missing required field: id/);

  plantCorrupt(
    "a non-ISO validFrom",
    GOOD_RAW.replace(/validFrom: .*/, "validFrom: yesterday"),
    /validFrom is not an ISO-8601 timestamp: "yesterday"/,
  );

  plantCorrupt("a malformed anchor (missing hash)", GOOD_RAW.replace("\n    hash: h1", ""), /anchor 0: missing hash/);

  plantCorrupt(
    "a malformed edge (unknown type)",
    GOOD_RAW.replace("type: anchored-to", "type: relates-to"),
    /edge 0: unknown type: "relates-to"/,
  );

  plantCorrupt("a string version", GOOD_RAW.replace("version: 1", 'version: "1"'), /version must be a number.*"1"/);

  it("treats hand-edited files as first-class: unquoted YAML timestamps normalize to strings", () => {
    // serializeNode quotes ISO strings so they round-trip as strings — but a
    // HUMAN editing the store writes `validFrom: 2026-09-08T17:30:00.000Z`
    // unquoted, which YAML 1.1 types as a Date. parseNode must normalize that
    // to the same instant as a string, or every hand-edited file quarantines.
    const text = `---
id: hand-edited
kind: claim
scope: global
anchors: []
edges: []
validFrom: 2026-09-08T17:30:00.000Z
validTo: null
txnTime: 2026-09-08T17:30:00.000Z
authority: default
overrideReason: null
---

a hand-written memory
`;
    const parsed = parseNode(text);
    expect(parsed.validFrom).toBe("2026-09-08T17:30:00.000Z");
    expect(typeof parsed.txnTime).toBe("string");
    expect(validateNode(parsed)).toEqual([]);
  });

  it("reports several bad files, one issue each, sorted by file name", () => {
    writeFileSync(join(dir, "zzz--bad.md"), "not frontmatter at all\n", "utf8");
    writeFileSync(join(dir, "aaa--bad.md"), GOOD_RAW.replace("kind: claim", "kind: decision"), "utf8");

    const { nodes, issues } = readStore(dir);

    expect(nodes).toEqual([]);
    expect(issues.map((i) => i.file)).toEqual(["aaa--bad.md", "zzz--bad.md"]);
    expect(issues).toHaveLength(2);
  });

  it("never deletes or moves a quarantined file — a human may be mid-edit", () => {
    writeFileSync(join(dir, "broken--abc123.md"), "not frontmatter at all\n", "utf8");

    readStore(dir);

    expect(existsSync(join(dir, "broken--abc123.md"))).toBe(true);
  });
});
