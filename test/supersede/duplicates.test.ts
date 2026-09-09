import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { open } from "../../src/facade/open.js";
import { remember } from "../../src/capture/index.js";
import { findDuplicates } from "../../src/supersede/index.js";
import type { MemoryNode } from "../../src/store/types.js";

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

function anchor(locator: string) {
  return { locator, hash: "deadbeef", artifactPath: "autoload/game_state.gd" };
}

// The double-onboarding shape: one belief captured twice, reworded, once
// anchored and once not — the pairs the dogfood store accumulated.
const PITY_A = node({
  id: "pity-a",
  summary: "The pity ladder guarantees a Legendary after N pulls; Secret is never a pity target",
  body:
    "The pity ladder in autoload/game_state.gd tops out at a guaranteed Legendary (index 4); the Secret rarity is never a pity target — it is roll-only.\n\n**Why:** pity is a climbable ladder, so the chase apex cannot be reached through it.\n\n**How to apply:** never promise a Secret via pity; the ladder ends at Legendary.",
  anchors: [anchor("autoload/game_state.gd › function _pity_rarity_for")],
});
const PITY_B = node({
  id: "pity-b",
  summary: "The pity system guarantees a Legendary pull after N misses; Secret is roll-only",
  body:
    "Pity guarantees a climbable ladder ending at Legendary after N unlucky pulls; the Secret rarity can never be targeted by pity and only drops from a roll.\n\n**Why:** the apex must stay a chase, so the ladder was built to stop below it.",
});
const AUTOMATION = node({
  id: "automation",
  kind: "lore-fact",
  summary: "Auto-buyers come only from the autobuy acquisition; automation is earned QoL, never a tax",
  body:
    "Auto-buyers come ONLY from the autobuy acquisition; automation is earned quality-of-life and is never a tax on the player.\n\n**Why:** the design doc decrees automation is earned, never imposed.\n\n**How to apply:** any new automation ships as a purchased acquisition.",
  anchors: [anchor("docs/DESIGN.md#Core design invariants")],
});
const CAP_RAISERS = node({
  id: "cap-raisers",
  kind: "lore-fact",
  summary: "Cap-raise mods are scoped and fixed (+N per stack), never a flat everything-bigger",
  body:
    "Cap-raise mods deepen one axis with a fixed +N per stack, never a flat everything-bigger, and never on income lines; every max-level read goes through max_level_for().\n\n**Why:** the player tracks re-readable caps, so raises must stay legible.\n\n**How to apply:** route all cap reads through max_level_for().",
  anchors: [anchor("docs/DESIGN.md#Core design invariants")],
});
const TEST_RUNNER = node({
  id: "test-runner",
  kind: "value",
  summary: "The test runner is vitest, run with npm test",
  body: "The repo's test runner is vitest; run it with npm test, watch mode with npm run test:watch.",
});

describe("findDuplicates", () => {
  it("flags a reworded re-capture of the same belief, naming the shared anchor", () => {
    const duplicates = findDuplicates([PITY_A, PITY_B, AUTOMATION, CAP_RAISERS, TEST_RUNNER]);
    const hit = duplicates.find((d) => d.a.id === "pity-a" || d.b.id === "pity-a");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThanOrEqual(0.44);
  });

  it("catches a pair whose summaries match even when the bodies diverge (and vice versa)", () => {
    const sameSummary = node({
      id: "sum-twin",
      summary: PITY_B.summary,
      body: "Unrelated depth: the offline earnings curve decays exponentially after eight hours away from the game.",
    });
    const duplicates = findDuplicates([PITY_B, sameSummary]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]!.score).toBeGreaterThanOrEqual(0.44);
  });

  it("does not flag two distinct invariants that share a doc heading", () => {
    // The dogfood's critical negative: 8+ beliefs legitimately anchor to the
    // same DESIGN.md heading; sharing the locator is not duplication.
    const duplicates = findDuplicates([AUTOMATION, CAP_RAISERS, TEST_RUNNER]);
    expect(duplicates).toHaveLength(0);
  });

  it("does not flag unrelated beliefs", () => {
    const duplicates = findDuplicates([PITY_A, TEST_RUNNER]);
    expect(duplicates).toHaveLength(0);
  });

  it("skips a pair a supersession already relates, and dead (superseded) nodes entirely", () => {
    const related = node({
      id: "pity-a",
      edges: [{ type: "superseded-by", target: "pity-b" }],
    });
    expect(findDuplicates([related, PITY_B])).toHaveLength(0);

    const dead = node({ id: "pity-dead", edges: [{ type: "superseded-by", target: "elsewhere" }] });
    expect(findDuplicates([dead, PITY_B])).toHaveLength(0);
  });

  it("never fires on a tiny node whose only shared word is ambient (the one-word entity)", () => {
    // Dogfood: nocetta's own store carries an entity whose body is the single
    // word "Nocetta" — containment 1.0 against every decision that says
    // "nocetta", subject evidence none. Ambient vocabulary cannot carry a pair.
    const entity = node({ id: "nocetta-entity", kind: "entity", body: "Nocetta" });
    const d1 = node({
      id: "decision-1",
      kind: "value",
      body: "DECISION: the committed .nocetta/ store gets an auto-generated human index, one line per current node.",
    });
    const d2 = node({
      id: "decision-2",
      kind: "value",
      body: "DECISION: the staging hint names the file just written under .nocetta/ so the agent can git add it.",
    });
    expect(findDuplicates([entity, d1, d2])).toHaveLength(0);
  });
});

describe("duplicate convergence through the loop", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nocetta-duplicates-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const BALANCE_A = {
    body:
      "Balance changes are validated by the headless sim before landing — monotonic progression, no runaway, no dead plateau.\n\n**Why:** the rebalance was anchored to a 45-minute active-play sim policy.\n\n**How to apply:** run the sim after touching any balance constant.",
    kind: "value" as const,
    summary: "Balance changes are gated by the headless sim before landing",
  };
  const BALANCE_B = {
    body:
      "Any change to economy constants must be validated against the headless simulation for monotonic progression before it lands.\n\n**Why:** eyeballing constants is how the runaway happened in the first place.\n\n**How to apply:** run the headless sim after touching balance constants and check the income band.",
    kind: "value" as const,
    summary: "Economy-constant changes are validated against the headless sim before landing",
  };

  it("remember warns on a duplicate capture; the worklist lists the pair until a supersede converges it", () => {
    const nc = open(dir);
    const first = nc.remember(BALANCE_A);

    // The onboarding-twice moment: a second pass re-states the same belief.
    const second = nc.remember(BALANCE_B);
    expect(second.warnings.join("\n")).toMatch(/duplicate advisory/);
    expect(second.warnings.join("\n")).toContain(first.node.id);

    // Both copies are live, so the worklist names the pair and teaches the
    // converging move.
    const worklist = nc.worklist();
    expect(worklist.duplicates).toHaveLength(1);
    const pair = [worklist.duplicates[0]!.a.id, worklist.duplicates[0]!.b.id].sort();
    expect(pair).toEqual([first.node.id, second.node.id].sort());

    // Convergence: one tip supersedes both copies (fan-in) — the pair leaves
    // the worklist and recall serves a single belief.
    const step1 = nc.supersede(first.node.id, node({ id: "balance-tip", body: BALANCE_B.body, summary: BALANCE_B.summary }));
    nc.supersede(second.node.id, step1.next);
    expect(nc.worklist().duplicates).toHaveLength(0);
  });

  it("remember does not warn when the write supersedes the very belief it overlaps", () => {
    const first = remember(join(dir, ".nocetta/memory"), [], BALANCE_A);
    expect(first.warnings).toHaveLength(0);

    const second = remember(join(dir, ".nocetta/memory"), [first.node], { ...BALANCE_B, supersedes: first.node.id });
    expect(second.warnings).toHaveLength(0);
    expect(second.superseded?.id).toBe(first.node.id);
  });
});
