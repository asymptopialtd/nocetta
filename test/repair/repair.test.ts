import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractContentSpans, extractSymbols } from "../../src/anchor/index.js";
import { remember } from "../../src/capture/index.js";
import { check } from "../../src/drift/check.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { open } from "../../src/facade/index.js";
import { reAnchor, retire } from "../../src/repair/index.js";
import { contextTriggered, searchMemory } from "../../src/retrieval/search.js";
import { asOf } from "../../src/bitemporal/as-of.js";
import { filenameFor, readAll } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

/**
 * Seam 4: the drift loop closes. Capture is the fixture workhorse (real
 * anchors via readArtifact injection), repair is the thing under test: a
 * dirty node becomes live again with no new node, and a retired belief
 * leaves "current" without leaving history.
 */

const CAPTURED_AT = "2026-05-01T00:00:00.000Z";
const RETIRED_AT = "2026-06-01T00:00:00.000Z";

const TS_SOURCE = `export function foo(): number {
  return 1;
}

export function bar(): string {
  return "bar";
}
`;

// The drift fixture: a real body edit to foo only.
const FOO_EDITED = TS_SOURCE.replace("return 1;", "return 42;");

const MD_SOURCE = `# Elminster

Elminster is a powerful archmage who lives in Shadowdale.

# Mystra

Mystra is the goddess of magic.
`;

let dir: string;
let repoRoot: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-repair-"));
  repoRoot = mkdtempSync(join(tmpdir(), "nocetta-repair-repo-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(repoRoot, { recursive: true, force: true });
});

/** Artifact sources for the injected reader; the foo.ts source is the drift dial. */
function sourcesWith(fooSource: string): (p: string) => string | undefined {
  return (p) => (p === "src/foo.ts" ? fooSource : p === "lore/mage.md" ? MD_SOURCE : undefined);
}

function captureFoo(source: string): MemoryNode {
  return remember(
    dir,
    [],
    { body: "foo returns 1", kind: "claim", artifactPath: "src/foo.ts", symbolName: "foo" },
    { readArtifact: sourcesWith(source), now: CAPTURED_AT },
  ).node;
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

describe("reAnchor", () => {
  it("repairs a drifted hash in place — locator, body, and valid-time window untouched — and check() goes live again", () => {
    const captured = captureFoo(TS_SOURCE);
    const drifted = check([captured], repoStateFromFiles({ "src/foo.ts": FOO_EDITED }));
    expect(drifted.dirty.has(captured.id)).toBe(true); // the drift is real before the repair

    const repaired = reAnchor(dir, [captured], captured.id, { symbolName: "foo" }, { readArtifact: sourcesWith(FOO_EDITED) });

    const fresh = extractSymbols("src/foo.ts", FOO_EDITED).find((s) => s.name === "foo")!;
    expect(repaired.anchors).toEqual([
      { locator: "src/foo.ts › function foo", hash: fresh.hash, artifactPath: "src/foo.ts" },
    ]);
    // identity repair only: the belief and its temporal state are the old ones
    expect(repaired.body).toBe(captured.body);
    expect(repaired.validFrom).toBe(CAPTURED_AT);
    expect(repaired.validTo).toBeNull();
    expect(repaired.txnTime).toBe(CAPTURED_AT);
    expect(repaired.edges).toEqual(captured.edges);

    // same file, overwritten in place — no second node exists
    const onDisk = readAll(dir);
    expect(onDisk).toEqual([repaired]);
    expect(filenameFor(onDisk[0]!)).toBe(filenameFor(captured));

    // and the loop's point: the repaired node is live against the new source
    const live = check([repaired], repoStateFromFiles({ "src/foo.ts": FOO_EDITED }));
    expect(live.dirty.has(repaired.id)).toBe(false);
  });

  it("refuses an unknown node id", () => {
    captureFoo(TS_SOURCE);
    expect(() => reAnchor(dir, [], "nope", { symbolName: "foo" }, { readArtifact: sourcesWith(TS_SOURCE) })).toThrow(
      /unknown node "nope"/,
    );
  });

  it("refuses a superseded node — repair is for live nodes; supersession already owns the dead ones", () => {
    const dead = node({ id: "dead", edges: [{ type: "superseded-by", target: "tip" }] });
    expect(() => reAnchor(dir, [dead], "dead", { symbolName: "foo" }, { readArtifact: sourcesWith(TS_SOURCE) })).toThrow(
      /superseded/,
    );
  });

  it("refuses a zero-anchor node — nothing to re-anchor", () => {
    const plain = node({ id: "plain" });
    expect(() => reAnchor(dir, [plain], "plain", { symbolName: "foo" }, { readArtifact: sourcesWith(TS_SOURCE) })).toThrow(
      /no anchors/,
    );
  });

  it("refuses a symbol that is not there, listing the available ones — the store is untouched", () => {
    const captured = captureFoo(TS_SOURCE);
    const call = () => reAnchor(dir, [captured], captured.id, { symbolName: "baz" }, { readArtifact: sourcesWith(TS_SOURCE) });
    expect(call).toThrow(/no symbol named "baz" in "src\/foo\.ts" — available symbols: foo, bar/);
    expect(readAll(dir)).toEqual([captured]);
  });

  it("refuses a request that names nothing, or names both strategies", () => {
    const captured = captureFoo(TS_SOURCE);
    expect(() => reAnchor(dir, [captured], captured.id, {}, { readArtifact: sourcesWith(TS_SOURCE) })).toThrow(
      /symbolName or heading is required/,
    );
    expect(() =>
      reAnchor(dir, [captured], captured.id, { symbolName: "foo", heading: "Elminster" }, { readArtifact: sourcesWith(TS_SOURCE) }),
    ).toThrow(/mutually exclusive/);
    expect(readAll(dir)).toEqual([captured]);
  });

  it("refuses a multi-anchor node when no anchored artifact resolves the request, listing the node's artifactPaths", () => {
    const multi = node({
      id: "multi",
      anchors: [
        { locator: "src/foo.ts › function foo", hash: "stale", artifactPath: "src/foo.ts" },
        { locator: "lore/mage.md#Elminster", hash: "stale", artifactPath: "lore/mage.md" },
      ],
    });
    const call = () => reAnchor(dir, [multi], "multi", { symbolName: "quux" }, { readArtifact: sourcesWith(TS_SOURCE) });
    expect(call).toThrow(/anchored to: src\/foo\.ts, lore\/mage\.md/);
    expect(readAll(dir)).toEqual([]);
  });

  it("repairs only the matching anchor on a multi-anchor node; the other anchor is untouched", () => {
    const mageAnchor = { locator: "lore/mage.md#Elminster", hash: "stale-hash", artifactPath: "lore/mage.md" };
    const multi = node({
      id: "multi",
      anchors: [{ locator: "src/foo.ts › function foo", hash: "stale-hash", artifactPath: "src/foo.ts" }, mageAnchor],
    });

    const repaired = reAnchor(dir, [multi], "multi", { symbolName: "foo" }, { readArtifact: sourcesWith(TS_SOURCE) });

    const fresh = extractSymbols("src/foo.ts", TS_SOURCE).find((s) => s.name === "foo")!;
    expect(repaired.anchors).toEqual([
      { locator: "src/foo.ts › function foo", hash: fresh.hash, artifactPath: "src/foo.ts" },
      mageAnchor, // byte-identical: the heading anchor is not this request's business
    ]);
  });

  it("repairs a heading anchor by the same machinery — the request resolves against the content artifact", () => {
    const fooAnchor = { locator: "src/foo.ts › function foo", hash: "stale-hash", artifactPath: "src/foo.ts" };
    const multi = node({
      id: "multi",
      anchors: [fooAnchor, { locator: "lore/mage.md#Elminster", hash: "stale-hash", artifactPath: "lore/mage.md" }],
    });

    const repaired = reAnchor(dir, [multi], "multi", { heading: "Mystra" }, { readArtifact: sourcesWith(TS_SOURCE) });

    const fresh = extractContentSpans("lore/mage.md", MD_SOURCE).find((s) => s.heading === "Mystra")!;
    expect(repaired.anchors).toEqual([
      fooAnchor,
      { locator: "lore/mage.md#Mystra", hash: fresh.hash, artifactPath: "lore/mage.md" },
    ]);
  });

  it("refuses when the request resolves against more than one anchored artifact — no silent pick", () => {
    const twoFiles = node({
      id: "twofiles",
      anchors: [
        { locator: "src/foo.ts › function foo", hash: "stale", artifactPath: "src/foo.ts" },
        { locator: "src/other.ts › function foo", hash: "stale", artifactPath: "src/other.ts" },
      ],
    });
    const sources = (p: string) => (p === "src/foo.ts" || p === "src/other.ts" ? TS_SOURCE : undefined);
    expect(() => reAnchor(dir, [twoFiles], "twofiles", { symbolName: "foo" }, { readArtifact: sources })).toThrow(
      /more than one anchored artifact/,
    );
  });
});

describe("retire", () => {
  it("closes the valid-time window and records the reason, in place", () => {
    const captured = captureFoo(TS_SOURCE);
    const retired = retire(dir, [captured], captured.id, "foo was deleted; the claim has no subject", { now: RETIRED_AT });

    expect(retired.validTo).toBe(RETIRED_AT);
    expect(retired.retiredReason).toBe("foo was deleted; the claim has no subject");
    // retirement is not a new belief: same body, same birth times, no edges
    expect(retired.body).toBe(captured.body);
    expect(retired.validFrom).toBe(captured.validFrom);
    expect(retired.txnTime).toBe(captured.txnTime);
    expect(retired.edges).toEqual(captured.edges);

    expect(readAll(dir)).toEqual([retired]);
  });

  it("drops the node out of search/contextTrigger results while asOf still sees it", () => {
    const captured = captureFoo(TS_SOURCE);
    const retired = retire(dir, [captured], captured.id, "withdrawn", { now: RETIRED_AT });
    const repoState = repoStateFromFiles({ "src/foo.ts": TS_SOURCE });
    const before = "2026-05-15T00:00:00.000Z";
    const after = "2026-07-01T00:00:00.000Z";

    // before the retirement moment it ranks (the anchor is fresh — the later
    // exclusion is the valid-window filter's doing, not drift's)
    expect(searchMemory([retired], repoState, { filesInPlay: ["src/foo.ts"], now: before }).map((r) => r.node.id)).toEqual([
      retired.id,
    ]);

    expect(searchMemory([retired], repoState, { filesInPlay: ["src/foo.ts"], now: after })).toEqual([]);
    expect(contextTriggered([retired], repoState, ["src/foo.ts"], { now: after })).toEqual([]);

    // bitemporal history is intact: retirement closed the window, it did not
    // erase the belief
    expect(asOf([retired], before).map((n) => n.id)).toEqual([retired.id]);
    expect(asOf([retired], after).map((n) => n.id)).toEqual([retired.id]);
  });

  it("refuses an empty reason, an unknown id, and a second retirement", () => {
    const captured = captureFoo(TS_SOURCE);
    expect(() => retire(dir, [captured], captured.id, "   ")).toThrow(/non-empty reason/);
    expect(() => retire(dir, [captured], "nope", "a reason")).toThrow(/unknown node "nope"/);

    const retired = retire(dir, [captured], captured.id, "first retirement", { now: RETIRED_AT });
    expect(() => retire(dir, [retired], retired.id, "a second retirement", { now: "2026-07-01T00:00:00.000Z" })).toThrow(
      /already retired/,
    );
  });
});

describe("the loop, closed end to end", () => {
  it("capture → drift → worklist → reAnchor → worklist clean → retire → out of current, one node throughout", () => {
    // a real repo on disk: the worklist lives on the facade, whose loader
    // reads real files
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    const fooPath = join(repoRoot, "src/foo.ts");
    writeFileSync(fooPath, TS_SOURCE, "utf8");
    const nc = open(repoRoot);

    const { node: captured } = nc.remember({ body: "foo returns 1", kind: "claim", artifactPath: "src/foo.ts", symbolName: "foo" });

    writeFileSync(fooPath, FOO_EDITED, "utf8");
    const dirty = nc.worklist().dirty;
    expect(dirty.map((d) => d.node.id)).toEqual([captured.id]);
    expect(dirty[0]!.reason).toMatch(/hash changed/);

    nc.reAnchor(captured.id, { symbolName: "foo" });
    expect(nc.worklist().dirty).toEqual([]);

    const retired = nc.retire(captured.id, "the foo claim is no longer wanted");
    expect(nc.search({ filesInPlay: ["src/foo.ts"] })).toEqual([]);
    expect(nc.asOf("2027-01-01T00:00:00.000Z").map((n) => n.id)).toEqual([retired.id]);
  });
});
