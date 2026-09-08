import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRoot } from "../../src/facade/root.js";

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
