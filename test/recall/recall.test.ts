import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";
import { appendRecall, readRecallLog, recallLogPath } from "../../src/recall/log.js";
import { classify } from "../../src/recall/residual.js";
import { buildLedger } from "../../src/recall/ledger.js";
import type { RecallEvent } from "../../src/recall/log.js";
import type { MemoryClass } from "../../src/recall/residual.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(partial: Partial<MemoryNode> & Pick<MemoryNode, "id">): MemoryNode {
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
    body: "",
    ...partial,
  };
}

describe("recall log", () => {
  let repoRoot: string;
  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "nocetta-recall-log-"));
  });
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("writes an event and reads it back", () => {
    appendRecall(repoRoot, { t: "2026-09-10T00:00:00.000Z", kind: "recall", ids: ["a", "b"] });
    expect(readRecallLog(repoRoot)).toEqual([{ t: "2026-09-10T00:00:00.000Z", kind: "recall", ids: ["a", "b"] }]);
  });

  it("self-owns .nocetta/.gitignore so the log is never committed", () => {
    appendRecall(repoRoot, { t: "t", kind: "recall", ids: ["a"] });
    const gitignore = readFileSync(join(repoRoot, ".nocetta", ".gitignore"), "utf8");
    expect(gitignore.split("\n")).toContain("recall-log.jsonl");
  });

  it("adds the ignore line once across repeated writes", () => {
    appendRecall(repoRoot, { t: "t", kind: "recall", ids: ["a"] });
    appendRecall(repoRoot, { t: "t", kind: "recall", ids: ["b"] });
    const gitignore = readFileSync(join(repoRoot, ".nocetta", ".gitignore"), "utf8");
    expect(gitignore.match(/recall-log\.jsonl/g)).toHaveLength(1);
  });

  it("drops empty-id events — a null recall is not a data point", () => {
    appendRecall(repoRoot, { t: "t", kind: "recall", ids: [] });
    expect(existsSync(recallLogPath(repoRoot))).toBe(false);
  });

  it("records ack distinctly from recall, and skips a corrupt line", () => {
    appendRecall(repoRoot, { t: "t1", kind: "recall", ids: ["a", "b"] });
    appendRecall(repoRoot, { t: "t2", kind: "ack", ids: ["a"] });
    writeFileSync(recallLogPath(repoRoot), `${readFileSync(recallLogPath(repoRoot), "utf8")}{ not json\n`, "utf8");
    expect(readRecallLog(repoRoot).map((e) => e.kind)).toEqual(["recall", "ack"]);
  });

  it("returns an empty log when none exists", () => {
    expect(readRecallLog(repoRoot)).toEqual([]);
  });
});

describe("residual classify", () => {
  const PATH = "src/util.ts";
  const SOURCE = "export function retryWithBackoff(maxAttempts: number) {\n  return maxAttempts;\n}\n";
  const read = (p: string): string | undefined => (p === PATH ? SOURCE : undefined);

  function codeAnchor(): Anchor {
    const sym = extractSymbols(PATH, SOURCE).find((s) => s.name === "retryWithBackoff")!;
    return { locator: sym.path, hash: sym.hash, artifactPath: PATH };
  }

  it("a decision with no code anchor is a complement", () => {
    expect(classify(node({ id: "1", kind: "value", body: "Ship on Fridays because Monday deploys burn the on-call." }), read)).toBe(
      "complement",
    );
  });

  it("a code-anchored claim that just restates the source is covered", () => {
    const n = node({ id: "2", anchors: [codeAnchor()], body: "retryWithBackoff will return maxAttempts." });
    expect(classify(n, read)).toBe("covered");
  });

  it("a code-anchored claim that adds rationale is a complement", () => {
    const n = node({
      id: "3",
      anchors: [codeAnchor()],
      body: "retryWithBackoff caps attempts at three because the upstream gateway blocks the fifth request and we saw cascading failures in the July incident.",
    });
    expect(classify(n, read)).toBe("complement");
  });

  it("an unreadable anchor falls through to complement rather than throwing", () => {
    const n = node({ id: "4", anchors: [{ locator: "gone.ts › function gone", hash: "x", artifactPath: "gone.ts" }], body: "anything" });
    expect(classify(n, () => undefined)).toBe("complement");
  });
});

describe("buildLedger", () => {
  const nodes = [
    node({ id: "w1", summary: "working complement" }),
    node({ id: "r1", summary: "redundant covered" }),
    node({ id: "d1", summary: "dormant complement" }),
    node({ id: "p1", summary: "prunable covered" }),
  ];
  const klass: Record<string, MemoryClass> = { w1: "complement", r1: "covered", d1: "complement", p1: "covered" };
  const events: RecallEvent[] = [
    { t: "t1", kind: "recall", ids: ["w1", "r1"] },
    { t: "t2", kind: "recall", ids: ["w1"] },
    { t: "t3", kind: "ack", ids: ["w1"] },
  ];

  it("places each node in the surfaced × complement quadrant", () => {
    const ledger = buildLedger(nodes, events, (n) => klass[n.id]!);
    expect(ledger.working.map((e) => e.id)).toEqual(["w1"]);
    expect(ledger.redundant.map((e) => e.id)).toEqual(["r1"]);
    expect(ledger.dormant.map((e) => e.id)).toEqual(["d1"]);
    expect(ledger.prunable.map((e) => e.id)).toEqual(["p1"]);
  });

  it("counts surfaced and cited from the log", () => {
    const ledger = buildLedger(nodes, events, (n) => klass[n.id]!);
    expect(ledger.working[0]).toMatchObject({ surfaced: 2, cited: 1 });
    expect(ledger.redundant[0]).toMatchObject({ surfaced: 1, cited: 0 });
    expect(ledger.dormant[0]).toMatchObject({ surfaced: 0, cited: 0 });
  });
});
