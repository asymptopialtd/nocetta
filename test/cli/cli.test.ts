import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, USAGE } from "../../src/cli/index.js";
import { MEMORY_DIR, open } from "../../src/facade/index.js";
import { filenameFor, writeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

/**
 * Seam 8: the CLI — check/worklist/ls over one facade, driven in-process
 * through runCli (the exact function main() wires argv/stdout onto; no
 * spawn, no stdout scraping). The properties under test: the exit-code
 * contract (--strict gates everything; a bare check gates only an
 * unreadable store, worklist gates nothing) and the report shape a human
 * or CI reads — the drift reason verbatim, the node's filename slug, the
 * quarantined file named.
 */

const FOO_PATH = "src/foo.ts";

const FOO_V0 = `export function foo(): number {
  return 1;
}
`;

// A real body edit to foo on disk — the store stays untouched, which is
// what makes the anchored node dirty.
const FOO_EDITED = FOO_V0.replace("return 1;", "return 42;");

const INV_ID = "inv-value-01";
const DEF_ID = "def-value-01";

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "nocetta-cli-"));
  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, FOO_PATH), FOO_V0, "utf8");
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
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

function seed(nodes: MemoryNode[]): void {
  const memoryDir = join(repoRoot, MEMORY_DIR);
  for (const n of nodes) writeNode(memoryDir, n);
}

/** Capture a live, anchored claim on the fixture function through the real
 * loop, and hand back the node — the source of id8/filename expectations. */
function rememberFoo(): MemoryNode {
  return open(repoRoot).remember({ body: "foo returns the number one", kind: "claim", artifactPath: FOO_PATH, symbolName: "foo" })
    .node;
}

function linesOf(out: string): string[] {
  return out.split("\n").filter((line) => line.length > 0);
}

describe("nocetta CLI (Seam 8)", () => {
  it("check on a clean store: exit 0 strict or not, and the summary line", async () => {
    rememberFoo();

    const plain = await runCli(["check", "--root", repoRoot]);
    expect(plain.code).toBe(0);
    expect(plain.out).toContain("1 nodes · 0 dirty · 0 conflicts · 0 issues");

    // a clean run prints exactly the summary line — no empty section headers
    const strict = await runCli(["check", "--strict", "--root", repoRoot]);
    expect(strict.code).toBe(0);
    expect(linesOf(strict.out)).toHaveLength(1);
  });

  it("check --strict after the anchored function is edited on disk: exit 1, dirty line names the reason and the file", async () => {
    const captured = rememberFoo();
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const { code, out } = await runCli(["check", "--strict", "--root", repoRoot]);

    expect(code).toBe(1);
    expect(out).toContain("hash changed");
    expect(out).toContain(captured.id.slice(0, 8));
    expect(out).toContain(`(file: ${filenameFor(captured)})`);
  });

  it("check without --strict in the same drifted state: exit 0 — drift alone doesn't break a casual check", async () => {
    rememberFoo();
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const { code, out } = await runCli(["check", "--root", repoRoot]);

    expect(code).toBe(0);
    expect(out).toContain("1 dirty");
  });

  it("check --strict with a quarantined store file: exit 1, the issue line names the file — and a bare check fails too", async () => {
    seed([node({ id: "good-1", body: "a healthy claim" })]);
    writeFileSync(join(repoRoot, MEMORY_DIR, "broken--abc123.md"), "not frontmatter at all\n", "utf8");

    const strict = await runCli(["check", "--strict", "--root", repoRoot]);
    expect(strict.code).toBe(1);
    expect(strict.out).toContain("broken--abc123.md");

    // an unreadable store is the one failure that outranks the no-gate mode
    const casual = await runCli(["check", "--root", repoRoot]);
    expect(casual.code).toBe(1);
  });

  it("worklist: exit 0 even with dirty nodes, and the report still lists them", async () => {
    const captured = rememberFoo();
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const { code, out } = await runCli(["worklist", "--root", repoRoot]);

    expect(code).toBe(0);
    expect(out).toContain("hash changed");
    expect(out).toContain(captured.id.slice(0, 8));
  });

  it("ls lists every node sorted by id, kind/authority columns padding-aligned, body truncated at 60 chars", async () => {
    seed([
      node({ id: "zz-claim-01", kind: "claim", authority: "default", body: "b".repeat(80) }),
      node({ id: "aa-value-01", kind: "value", authority: "invariant", body: "we ship on fridays" }),
    ]);

    const { code, out } = await runCli(["ls", "--root", repoRoot]);
    const lines = linesOf(out);

    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
    // sorted by id, not by insertion order
    expect(lines[0]).toMatch(/^aa-value {2}value {2}invariant {2}we ship on fridays$/);
    expect(lines[1]).toMatch(/^zz-claim {2}claim {2}default {4}b{60}$/);
    expect(lines[1]).not.toContain("b".repeat(61));
  });

  it("ls --kind filters to the requested kind", async () => {
    seed([
      node({ id: "zz-claim-01", kind: "claim", body: "a claim" }),
      node({ id: "aa-value-01", kind: "value", body: "a value" }),
    ]);

    const { code, out } = await runCli(["ls", "--kind", "value", "--root", repoRoot]);
    const lines = linesOf(out);

    expect(code).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^aa-value {2}value {2}/);
  });

  it("a cross-authority conflict prints the subject and both parties, and fails --strict", async () => {
    seed([
      node({ id: INV_ID, kind: "value", scope: "deploys", authority: "invariant", body: "we never deploy on fridays" }),
      node({ id: DEF_ID, kind: "value", scope: "deploys", authority: "default", body: "we ship on fridays" }),
    ]);

    const { code, out } = await runCli(["check", "--strict", "--root", repoRoot]);

    expect(code).toBe(1);
    expect(out).toContain("conflicts (1):");
    expect(out).toContain("scope:deploys");
    expect(out).toContain(`invariant  ${INV_ID.slice(0, 8)}`);
    expect(out).toContain(`default    ${DEF_ID.slice(0, 8)}`);
    expect(out).toContain("2 nodes · 0 dirty · 1 conflicts · 0 issues");
  });

  it("unknown command exits 1 with usage; no command too; --help exits 0 with it", async () => {
    const unknown = await runCli(["bogus"]);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain(USAGE);

    const bare = await runCli([]);
    expect(bare.code).toBe(1);
    expect(bare.out).toContain(USAGE);

    const help = await runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain(USAGE);
  });
});
