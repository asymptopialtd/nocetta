import { describe, expect, it } from "vitest";
import { RISING_BAR_MARGIN, selectPushRecall } from "../../src/recall/push-recall.js";
import type { PriorInjection } from "../../src/recall/push-recall.js";
import type { RankedCandidate } from "../../src/retrieval/types.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(partial: Partial<MemoryNode> & Pick<MemoryNode, "id">): MemoryNode {
  return {
    kind: "value",
    scope: "global",
    anchors: [],
    edges: [],
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    txnTime: "2026-01-01T00:00:00.000Z",
    authority: "default",
    overrideReason: null,
    body: "a memory",
    ...partial,
  };
}

function candidate(id: string, score: number, opts: { anchored?: boolean } = {}): RankedCandidate {
  return {
    node: node({ id }),
    matchedFiles: opts.anchored ? new Set(["src/foo.ts"]) : new Set(),
    keywordScore: score,
    score,
  };
}

const FLOOR = 9;

describe("selectPushRecall", () => {
  it("defaults to silence: a candidate at or below the floor never injects", () => {
    expect(selectPushRecall([candidate("a", FLOOR)], [], { floor: FLOOR })).toBeNull();
    expect(selectPushRecall([candidate("a", FLOOR - 0.01)], [], { floor: FLOOR })).toBeNull();
  });

  it("no candidates at all: silence", () => {
    expect(selectPushRecall([], [], { floor: FLOOR })).toBeNull();
  });

  it("injects the single strongest candidate above the floor — capped at one", () => {
    const picks = [candidate("weak", FLOOR + 0.5), candidate("strong", FLOOR + 5), candidate("mid", FLOOR + 2)];
    const pick = selectPushRecall(picks, [], { floor: FLOOR });
    expect(pick).not.toBeNull();
    expect(pick!.node.id).toBe("strong");
    expect(pick!.score).toBe(FLOOR + 5);
  });

  it("a node injected and later acked is suppressed permanently — even at a much higher score", () => {
    const prior: PriorInjection[] = [{ id: "used", score: FLOOR + 1, acked: true, viaAnchor: false }];
    const pick = selectPushRecall([candidate("used", FLOOR + 20)], prior, { floor: FLOOR });
    expect(pick).toBeNull();
  });

  it("a node injected and ignored (no ack) stays suppressed at the same score", () => {
    const prior: PriorInjection[] = [{ id: "ignored", score: FLOOR + 5, acked: false, viaAnchor: false }];
    const pick = selectPushRecall([candidate("ignored", FLOOR + 5)], prior, { floor: FLOOR });
    expect(pick).toBeNull();
  });

  it("an ignored node re-fires once its score clears the rising bar", () => {
    const prior: PriorInjection[] = [{ id: "ignored", score: FLOOR + 5, acked: false, viaAnchor: false }];
    // exactly at the margin still fails — "materially exceeds" is a strict >
    const atMargin = selectPushRecall([candidate("ignored", FLOOR + 5 + RISING_BAR_MARGIN)], prior, { floor: FLOOR });
    expect(atMargin).toBeNull();
    const overMargin = selectPushRecall([candidate("ignored", FLOOR + 5 + RISING_BAR_MARGIN + 0.01)], prior, { floor: FLOOR });
    expect(overMargin).not.toBeNull();
    expect(overMargin!.node.id).toBe("ignored");
  });

  it("a node never injected this session has no suppression to clear", () => {
    const prior: PriorInjection[] = [{ id: "other", score: 999, acked: false, viaAnchor: false }];
    const pick = selectPushRecall([candidate("fresh", FLOOR + 1)], prior, { floor: FLOOR });
    expect(pick!.node.id).toBe("fresh");
  });

  it("an anchor-gated candidate bypasses the floor entirely", () => {
    const pick = selectPushRecall([candidate("anchored", 0.1, { anchored: true })], [], { floor: FLOOR });
    expect(pick).not.toBeNull();
    expect(pick!.node.id).toBe("anchored");
    expect(pick!.viaAnchor).toBe(true);
  });

  it("an anchor match overrides a prior keyword injection that was ignored", () => {
    // the false-positive-then-anchor case: a weak keyword hit surfaced M and
    // was ignored; later the prompt names M's anchored file. The anchor is
    // real evidence, so it re-surfaces despite the earlier keyword suppression.
    const prior: PriorInjection[] = [{ id: "anchored", score: FLOOR + 5, acked: false, viaAnchor: false }];
    const pick = selectPushRecall([candidate("anchored", 0.1, { anchored: true })], prior, { floor: FLOOR });
    expect(pick!.node.id).toBe("anchored");
    expect(pick!.viaAnchor).toBe(true);
  });

  it("an anchor match is suppressed once it has already surfaced via anchor this session", () => {
    // an anchor surfaces a memory precisely once — repeating it every turn the
    // file is mentioned would nag.
    const prior: PriorInjection[] = [{ id: "anchored", score: 20, acked: false, viaAnchor: true }];
    const pick = selectPushRecall([candidate("anchored", 0.1, { anchored: true })], prior, { floor: FLOOR });
    expect(pick).toBeNull();
  });

  it("an anchor match is suppressed after the memory was used, whatever the source", () => {
    const prior: PriorInjection[] = [{ id: "anchored", score: 50, acked: true, viaAnchor: false }];
    const pick = selectPushRecall([candidate("anchored", 0.1, { anchored: true })], prior, { floor: FLOOR });
    expect(pick).toBeNull();
  });

  it("a suppressed anchor does not block a fresh keyword hit on another node", () => {
    const prior: PriorInjection[] = [{ id: "anchored", score: 20, acked: false, viaAnchor: true }];
    const pick = selectPushRecall(
      [candidate("anchored", 0.1, { anchored: true }), candidate("fresh-keyword", FLOOR + 3)],
      prior,
      { floor: FLOOR },
    );
    expect(pick!.node.id).toBe("fresh-keyword");
    expect(pick!.viaAnchor).toBe(false);
  });

  it("an anchor-gated candidate is preferred over a higher-scoring keyword-only one", () => {
    const pick = selectPushRecall(
      [candidate("keyword-only", FLOOR + 50), candidate("anchored", FLOOR - 5, { anchored: true })],
      [],
      { floor: FLOOR },
    );
    expect(pick!.node.id).toBe("anchored");
  });

  it("current-only is inherited, never re-derived: a node the caller already filtered out cannot be picked", () => {
    // filterLive (upstream of rankedSearch) is what excludes dirty/superseded/
    // expired nodes — selectPushRecall only ever sees what's handed to it, so
    // a superseded node simply never appears in `candidates` in the first
    // place. Nothing in this module re-checks validity.
    const candidates = [candidate("live-tip", FLOOR + 3)];
    const pick = selectPushRecall(candidates, [], { floor: FLOOR });
    expect(pick!.node.id).toBe("live-tip");
    expect(selectPushRecall(candidates, [], { floor: FLOOR })?.node.id).not.toBe("superseded-and-absent");
  });
});
