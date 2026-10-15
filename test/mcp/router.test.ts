import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Nocetta } from "../../src/facade/index.js";
import { StoreRouter } from "../../src/mcp/router.js";

/**
 * Per-write store resolution (the fix for a parent-launched server planting one
 * shared store): the router picks WHICH project's store each call lands in. We
 * inject `openStore` so each test observes the routed root directly, and
 * `listRoots` so the unanchored path needs no live MCP client.
 */

let parent: string;
/** Which root each open() was asked for — the routing decision, observed. */
let opened: string[];

/** A stub facade that only records the root it was opened against. */
function stubOpen(root: string): Nocetta {
  opened.push(root);
  return { repoRoot: root } as unknown as Nocetta;
}

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "nocetta-router-"));
  opened = [];
});

afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
});

function mkRepo(name: string, markers: string[] = [".git"]): string {
  const dir = join(parent, name);
  for (const m of markers) mkdirSync(join(dir, m), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n", "utf8");
  return dir;
}

describe("StoreRouter — anchored routing", () => {
  it("routes an anchored write to the artifact's own project, path rebased to that store", () => {
    const game = mkRepo("game");
    const router = new StoreRouter({ base: parent, openStore: stubOpen });

    const { nc, artifactPath } = router.forArtifact("game/src/a.ts");

    expect(nc.repoRoot).toBe(game);
    expect(artifactPath).toBe("src/a.ts");
    expect(opened).toEqual([game]);
  });

  it("caches the facade per root — the same project opens once across calls", () => {
    mkRepo("game");
    const router = new StoreRouter({ base: parent, openStore: stubOpen });
    router.forArtifact("game/src/a.ts");
    router.forArtifact("game/src/a.ts");
    expect(opened).toHaveLength(1);
  });

  it("refuses when the resolved root is the bare multi-repo parent itself", () => {
    mkRepo("game-a");
    mkRepo("game-b");
    writeFileSync(join(parent, "loose.ts"), "export const x = 1;\n", "utf8");
    const router = new StoreRouter({ base: parent, openStore: stubOpen });
    // a file sitting directly in the bare parent resolves to the parent → guard
    expect(() => router.forArtifact("loose.ts")).toThrow(/holding separate project repos|NOCETTA_ROOT/);
  });
});

describe("StoreRouter — unanchored (client roots)", () => {
  it("uses the sole advertised root", async () => {
    const game = mkRepo("game");
    const router = new StoreRouter({ base: parent, openStore: stubOpen, listRoots: async () => [game] });
    const { nc } = await router.forDefault();
    expect(nc.repoRoot).toBe(game);
  });

  it("collapses several roots to the single project repo among them", async () => {
    const game = mkRepo("game");
    const notes = join(parent, "notes");
    mkdirSync(notes, { recursive: true });
    const router = new StoreRouter({ base: parent, openStore: stubOpen, listRoots: async () => [notes, game] });
    const { nc } = await router.forDefault();
    expect(nc.repoRoot).toBe(game);
  });

  it("refuses as ambiguous when several roots are all project repos", async () => {
    const a = mkRepo("game-a");
    const b = mkRepo("game-b");
    const router = new StoreRouter({ base: parent, openStore: stubOpen, listRoots: async () => [a, b] });
    await expect(router.forDefault()).rejects.toThrow(/ambiguous|NOCETTA_ROOT/);
  });

  it("falls back to discovery from base when the client advertises no roots — and the guard fires at a bare parent", async () => {
    mkRepo("game-a");
    mkRepo("game-b");
    const router = new StoreRouter({ base: parent, openStore: stubOpen, listRoots: async () => [] });
    await expect(router.forDefault()).rejects.toThrow(/holding separate project repos|NOCETTA_ROOT/);
  });
});

describe("StoreRouter — override bypasses everything", () => {
  it("forces the override root for anchored, files, and default — path and guard untouched", async () => {
    mkRepo("game-a");
    mkRepo("game-b");
    const forced = join(parent, "forced-store");
    mkdirSync(forced, { recursive: true });
    const router = new StoreRouter({ base: parent, override: forced, openStore: stubOpen, listRoots: async () => [] });

    const anchored = router.forArtifact("game-a/src/a.ts");
    expect(anchored.nc.repoRoot).toBe(forced);
    expect(anchored.artifactPath).toBe("game-a/src/a.ts"); // unchanged under override

    const def = await router.forDefault(); // would be ambiguous/guarded without override
    expect(def.nc.repoRoot).toBe(forced);
  });
});

describe("StoreRouter — single-project launch is unchanged", () => {
  it("a server based inside one project routes every call to that project", async () => {
    const game = mkRepo("game");
    // base is the project itself; the sole advertised root is the project
    const router = new StoreRouter({ base: game, openStore: stubOpen, listRoots: async () => [game] });

    expect(router.forArtifact("src/a.ts").nc.repoRoot).toBe(game);
    expect(router.forArtifact("src/a.ts").artifactPath).toBe("src/a.ts");
    expect((await router.forDefault()).nc.repoRoot).toBe(game);
    expect(router.forFiles(["src/a.ts"]).nc.repoRoot).toBe(game);
  });
});
