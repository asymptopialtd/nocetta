import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
    expect(plain.out).toContain("1 nodes · 0 dirty · 0 conflicts · 0 dups · 0 issues");

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
    expect(out).toContain("2 nodes · 0 dirty · 1 conflicts · 0 dups · 0 issues");
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

describe("nocetta hook user-prompt-submit (push-recall)", () => {
  // Spawned rather than driven through runCli in-process: hookCommand reads
  // stdin via readFileSync(0), so a real child process with piped input is
  // what actually exercises that path (same reasoning as the symlink test
  // below). dist must be built; skip when it isn't.
  const distCli = fileURLToPath(new URL("../../dist/cli/cli.js", import.meta.url));

  function runHook(prompt: string | null, envOverrides: Record<string, string> = {}): { code: number; out: string } {
    const input = prompt === null ? "{ not json" : JSON.stringify({ prompt, session_id: "s1" });
    try {
      const out = execFileSync(process.execPath, [distCli, "hook", "user-prompt-submit", "--root", repoRoot], {
        input,
        encoding: "utf8",
        env: { ...process.env, ...envOverrides },
      });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      return { code: e.status ?? 1, out: e.stdout ?? "" };
    }
  }

  it("emits a valid hookSpecificOutput JSON on a strong, floor-clearing hit", () => {
    if (!existsSync(distCli)) return;
    const { node: pushed } = open(repoRoot).remember({
      body: "The elephant zebra giraffe protocol governs how retries back off.",
      kind: "value",
    });

    const { code, out } = runHook("tell me about the elephant zebra giraffe protocol", { NOCETTA_PUSH_FLOOR: "0" });

    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("nocetta:");
    expect(parsed.hookSpecificOutput.additionalContext).toContain(pushed.id.slice(0, 8));
  });

  it("stays silent (empty stdout) on a prompt sharing no vocabulary with any memory", () => {
    if (!existsSync(distCli)) return;
    open(repoRoot).remember({ body: "The elephant zebra giraffe protocol governs retries.", kind: "value" });

    const { code, out } = runHook("completely unrelated words with zero overlap whatsoever");

    expect(code).toBe(0);
    expect(out).toBe("");
  });

  it("degrades to a silent no-op on malformed stdin", () => {
    if (!existsSync(distCli)) return;
    const { code, out } = runHook(null);
    expect(code).toBe(0);
    expect(out).toBe("");
  });

  it("NOCETTA_PUSH_OFF silences an otherwise-strong hit", () => {
    if (!existsSync(distCli)) return;
    open(repoRoot).remember({ body: "The elephant zebra giraffe protocol governs how retries back off.", kind: "value" });

    const { code, out } = runHook("tell me about the elephant zebra giraffe protocol", {
      NOCETTA_PUSH_FLOOR: "0",
      NOCETTA_PUSH_OFF: "1",
    });

    expect(code).toBe(0);
    expect(out).toBe("");
  });

  it("a dirty node never injects even with a strong keyword match — current-only is inherited from filterLive", () => {
    if (!existsSync(distCli)) return;
    open(repoRoot).remember({
      body: "The elephant zebra giraffe protocol governs how retries back off.",
      kind: "claim",
      artifactPath: FOO_PATH,
      symbolName: "foo",
    });
    // Edit the anchored source without updating the node — the anchor hash
    // no longer matches, so filterLive (upstream of rankedSearch) drops it.
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const { code, out } = runHook("tell me about the elephant zebra giraffe protocol", { NOCETTA_PUSH_FLOOR: "0" });

    expect(code).toBe(0);
    expect(out).toBe("");
  });
});

describe("bin entrypoint (symlink regression)", () => {
  it("runs when invoked through a package-manager bin symlink — never a silent exit 0", async () => {
    // pnpm installs node_modules/<pkg> as a symlink: argv[1] keeps the link
    // path while import.meta.url resolves the target. The guard compared them
    // literally, so `npx nocetta …` exited 0 printing nothing. dist must be
    // built for this test to have something to invoke; skip when it isn't.
    const distCli = fileURLToPath(new URL("../../dist/cli/cli.js", import.meta.url));
    if (!existsSync(distCli)) return;

    const linkDir = mkdtempSync(join(tmpdir(), "nocetta-bin-"));
    const link = join(linkDir, "nocetta");
    symlinkSync(distCli, link);
    try {
      const out = execFileSync(process.execPath, [link, "check", "--root", repoRoot], { encoding: "utf8" });
      expect(out).toMatch(/\d+ nodes · \d+ dirty/);
    } finally {
      rmSync(linkDir, { recursive: true, force: true });
    }
  });
});
