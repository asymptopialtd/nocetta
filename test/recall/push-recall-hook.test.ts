import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendRecall } from "../../src/recall/log.js";
import { extractFilePaths, priorInjectionsFor } from "../../src/recall/user-prompt-submit-hook.js";

describe("extractFilePaths", () => {
  const repo = "/repo";
  it("pulls a repo-relative path out of prose", () => {
    expect(extractFilePaths("please fix src/recall/log.ts today", repo, repo)).toEqual(["src/recall/log.ts"]);
  });

  it("normalizes an absolute path under the repo to repo-relative", () => {
    expect(extractFilePaths("see /repo/src/foo.ts", repo, repo)).toEqual(["src/foo.ts"]);
  });

  it("resolves a cwd-relative path against cwd, not the repo root", () => {
    expect(extractFilePaths("look at foo.ts in bar/foo.ts", repo, "/repo/pkg")).toEqual(["pkg/bar/foo.ts"]);
  });

  it("drops paths that escape the repo", () => {
    expect(extractFilePaths("edit /etc/thing.conf", repo, repo)).toEqual([]);
  });

  it("does not match a bare filename with no slash (an anchor path is never bare)", () => {
    expect(extractFilePaths("the push-recall.ts file", repo, repo)).toEqual([]);
  });

  it("finds the path inside a markdown link and dedupes repeats", () => {
    expect(extractFilePaths("[log](src/recall/log.ts) and again src/recall/log.ts", repo, repo)).toEqual([
      "src/recall/log.ts",
    ]);
  });
});

describe("priorInjectionsFor", () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nocetta-push-hook-"));
  });
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns nothing without a session id (can't scope the dedup)", () => {
    appendRecall(repoRoot, { t: "t1", kind: "inject", ids: ["a"], session: "s1", score: 10 });
    expect(priorInjectionsFor(repoRoot, undefined)).toEqual([]);
  });

  it("scopes to the session and carries score, source, and ack state", () => {
    appendRecall(repoRoot, { t: "2026-01-01T00:00:00.000Z", kind: "inject", ids: ["kw"], session: "s1", score: 11, source: "keyword" });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:01.000Z", kind: "inject", ids: ["anc"], session: "s1", score: 20, source: "anchor" });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:02.000Z", kind: "inject", ids: ["other"], session: "s2", score: 30 });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:03.000Z", kind: "ack", ids: ["kw"] });

    const priors = priorInjectionsFor(repoRoot, "s1");
    expect(priors).toHaveLength(2);
    const kw = priors.find((p) => p.id === "kw")!;
    expect(kw).toMatchObject({ score: 11, viaAnchor: false, acked: true });
    const anc = priors.find((p) => p.id === "anc")!;
    expect(anc).toMatchObject({ score: 20, viaAnchor: true, acked: false });
  });

  it("an ack before the inject does not count (ack is a time-ordered proxy)", () => {
    appendRecall(repoRoot, { t: "2026-01-01T00:00:00.000Z", kind: "ack", ids: ["a"] });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:01.000Z", kind: "inject", ids: ["a"], session: "s1", score: 10 });
    expect(priorInjectionsFor(repoRoot, "s1")[0]!.acked).toBe(false);
  });

  it("compaction resets the window: injections before the marker stop counting", () => {
    appendRecall(repoRoot, { t: "2026-01-01T00:00:00.000Z", kind: "inject", ids: ["early"], session: "s1", score: 10 });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:01.000Z", kind: "compaction", ids: [], session: "s1" });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:02.000Z", kind: "inject", ids: ["late"], session: "s1", score: 12 });

    const priors = priorInjectionsFor(repoRoot, "s1");
    expect(priors.map((p) => p.id)).toEqual(["late"]);
  });

  it("a session-less compaction marker still resets (the PreCompact fallback)", () => {
    appendRecall(repoRoot, { t: "2026-01-01T00:00:00.000Z", kind: "inject", ids: ["early"], session: "s1", score: 10 });
    appendRecall(repoRoot, { t: "2026-01-01T00:00:01.000Z", kind: "compaction", ids: [] });
    expect(priorInjectionsFor(repoRoot, "s1")).toEqual([]);
  });
});
