import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBareMultiRepoParent, resolveRoot, resolveRootFromArtifact } from "../../src/facade/root.js";

/**
 * Root discovery (the per-project answer): the store root is found by walking
 * up, the way git finds a repo — NOCETTA_ROOT/--root are overrides, never a
 * requirement, so one globally-registered MCP server serves every project.
 */

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "nocetta-root-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("resolveRoot", () => {
  it("walks up to the nearest ancestor holding .nocetta/", () => {
    mkdirSync(join(repo, ".nocetta"), { recursive: true });
    mkdirSync(join(repo, "deeply", "nested", "src"), { recursive: true });

    const from = join(repo, "deeply", "nested", "src");
    expect(resolveRoot({ from })).toBe(repo);
  });

  it("falls back to the nearest .git/ as the project boundary — a first write creates the store there", () => {
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, "packages", "app", "src"), { recursive: true });

    const from = join(repo, "packages", "app", "src");
    expect(resolveRoot({ from })).toBe(repo);
  });

  it("the nearest level wins: a subproject's .nocetta beats an outer repo's .git", () => {
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, "subproject", ".nocetta"), { recursive: true });
    mkdirSync(join(repo, "subproject", "src"), { recursive: true });

    expect(resolveRoot({ from: join(repo, "subproject", "src") })).toBe(join(repo, "subproject"));
    // ...but a sibling of the subproject still resolves to the outer repo
    mkdirSync(join(repo, "other", "src"), { recursive: true });
    expect(resolveRoot({ from: join(repo, "other", "src") })).toBe(repo);
  });

  it("at the same level an existing store beats a git marker", () => {
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, ".nocetta"), { recursive: true });
    // both markers at the start dir: the store marker is what named it a store
    expect(resolveRoot({ from: repo })).toBe(repo);
  });

  it("no markers anywhere: the starting directory itself — writes land in cwd, honestly", () => {
    const from = join(repo, "plain", "dir");
    mkdirSync(from, { recursive: true });
    expect(resolveRoot({ from })).toBe(from);
  });

  it("an explicit root wins over discovery, resolved against the starting directory", () => {
    mkdirSync(join(repo, ".nocetta"), { recursive: true });
    mkdirSync(join(repo, "elsewhere"), { recursive: true });

    expect(resolveRoot({ explicit: "elsewhere", from: repo })).toBe(join(repo, "elsewhere"));
    expect(resolveRoot({ explicit: repo, from: join(repo, ".nocetta") })).toBe(repo);
  });
});

/**
 * Resolving the store from the artifact a write names — the anchored-write
 * routing that keeps a parent-launched server from planting one shared store:
 * the path identifies the project, the walk finds its boundary.
 */
describe("resolveRootFromArtifact", () => {
  it("walks up from the artifact's own location to the project, not the launch base", () => {
    // parent/ holds a child project repo; the server's base IS the bare parent
    mkdirSync(join(repo, "game", ".git"), { recursive: true });
    mkdirSync(join(repo, "game", "ui", "duat"), { recursive: true });
    writeFileSync(join(repo, "game", "ui", "duat", "foe.gd"), "extends Node\n", "utf8");

    const resolved = resolveRootFromArtifact(repo, "game/ui/duat/foe.gd");
    expect(resolved.root).toBe(join(repo, "game"));
    // stored path is relative to the project store, never the launch base
    expect(resolved.artifactPath).toBe("ui/duat/foe.gd");
  });

  it("a nested project store beats the outer repo, and the path rebases to it", () => {
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(join(repo, "sub", ".nocetta"), { recursive: true });
    mkdirSync(join(repo, "sub", "src"), { recursive: true });
    writeFileSync(join(repo, "sub", "src", "a.ts"), "export const a = 1;\n", "utf8");

    const resolved = resolveRootFromArtifact(repo, "sub/src/a.ts");
    expect(resolved.root).toBe(join(repo, "sub"));
    expect(resolved.artifactPath).toBe("src/a.ts");
  });
});

/**
 * The guard that would have caught the original bug: a bare parent of child
 * repos is not itself a store target.
 */
describe("isBareMultiRepoParent", () => {
  it("is true for a bare directory holding child .git / .nocetta projects", () => {
    mkdirSync(join(repo, "game-a", ".git"), { recursive: true });
    mkdirSync(join(repo, "game-b", ".nocetta"), { recursive: true });
    expect(isBareMultiRepoParent(repo)).toBe(true);
  });

  it("is false once the directory is itself a repo or a store", () => {
    mkdirSync(join(repo, "child", ".git"), { recursive: true });
    mkdirSync(join(repo, ".git"), { recursive: true });
    // a real project that merely contains a vendored sub-repo is not a bare parent
    expect(isBareMultiRepoParent(repo)).toBe(false);
  });

  it("is false for a plain directory with no child projects", () => {
    mkdirSync(join(repo, "notes"), { recursive: true });
    mkdirSync(join(repo, "assets"), { recursive: true });
    expect(isBareMultiRepoParent(repo)).toBe(false);
  });
});
