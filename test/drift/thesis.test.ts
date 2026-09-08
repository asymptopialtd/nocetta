import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";
import { check, currentNodes, repoStateFromFiles } from "../../src/drift/index.js";
import { readAll, writeNode } from "../../src/store/index.js";
import type { MemoryNode } from "../../src/store/index.js";

/**
 * Slice 3 GO/NO-GO: the adversarial replay eval.
 *
 * A small fixture "repo" (two files, several symbols) with a memory graph
 * anchored across it: a direct code claim, a dependent decision node
 * (propagation), an already-superseded node (propagation wall), a node
 * downstream of the superseded one (must NOT inherit dirtiness), and an
 * unrelated claim anchored to an untouched function (must never false-positive).
 *
 * Replays two adversaries against that graph:
 *   1. a real body edit to the anchored function — must dirty, must propagate,
 *      must stop at the superseded wall, must exclude from "current".
 *   2. a pure line-move (new code inserted above, nothing in the anchored
 *      symbol's body touched) — must NOT dirty anything.
 */

const BILLING_PATH = "src/billing.ts";
const UTIL_PATH = "src/util.ts";

const billingV0 = `export function calculateTotal(items: number[]): number {
  return items.reduce((sum, x) => sum + x, 0);
}

export class Invoice {
  finalize(): string {
    return "finalized";
  }
}
`;

// Body edit: same signature, different logic (loop instead of reduce).
const billingV1_bodyEdit = `export function calculateTotal(items: number[]): number {
  let sum = 0;
  for (const x of items) sum += x;
  return sum;
}

export class Invoice {
  finalize(): string {
    return "finalized";
  }
}
`;

// Line-move: a new function and a leading comment inserted above
// calculateTotal, plus a trailing comment after the class — the anchored
// symbols' own bodies are byte-for-byte identical to v0.
const billingV1_lineMove = `// billing helpers
export function taxRate(): number {
  return 0.0825;
}

${billingV0}
// end of file
`;

const utilV0 = `export function formatCurrency(amount: number): string {
  return \`$\${amount.toFixed(2)}\`;
}
`;

function anchorFor(filePath: string, source: string, path: string): Anchor {
  const symbol = extractSymbols(filePath, source).find((s) => s.path === path);
  if (!symbol) throw new Error(`fixture bug: no symbol at ${path}`);
  return { locator: symbol.path, hash: symbol.hash, artifactPath: filePath };
}

function baseNode(overrides: Partial<MemoryNode> & { id: string }): MemoryNode {
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
    ...overrides,
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-thesis-"));

  const calcTotalAnchor = anchorFor(BILLING_PATH, billingV0, `${BILLING_PATH} › function calculateTotal`);
  const finalizeAnchor = anchorFor(BILLING_PATH, billingV0, `${BILLING_PATH} › class Invoice › method finalize`);
  const formatAnchor = anchorFor(UTIL_PATH, utilV0, `${UTIL_PATH} › function formatCurrency`);

  // c1: direct code claim, anchored to calculateTotal.
  const c1 = baseNode({
    id: "c1",
    kind: "claim",
    anchors: [calcTotalAnchor],
    body: "calculateTotal sums the items array via reduce.",
  });

  // c2: control — claim anchored to an *untouched* function in a *different*
  // file. Must stay clean through both adversaries: proves precision, not
  // just recall.
  const c2 = baseNode({
    id: "c2",
    kind: "claim",
    anchors: [formatAnchor],
    body: "formatCurrency renders two decimal places.",
  });

  // d1: decision node with no code anchor of its own, but depends on c1 via
  // anchored-to. Must inherit c1's dirtiness (propagation).
  const d1 = baseNode({
    id: "d1",
    kind: "value",
    edges: [{ type: "anchored-to", target: "c1" }],
    body: "we always call calculateTotal before formatting the invoice total.",
  });

  // e1: also depends on c1, but is itself already superseded. Propagation
  // must still be able to reach e1 (it also depends on c1's code)...
  const e1 = baseNode({
    id: "e1",
    kind: "claim",
    anchors: [finalizeAnchor],
    edges: [
      { type: "anchored-to", target: "c1" },
      { type: "superseded-by", target: "e2" },
    ],
    body: "(superseded) Invoice.finalize used to depend on the total calc directly.",
  });

  // f1: depends on e1 via anchored-to. Must NOT inherit dirtiness that
  // reaches e1, because propagation stops at a superseded node.
  const f1 = baseNode({
    id: "f1",
    kind: "value",
    edges: [{ type: "anchored-to", target: "e1" }],
    body: "downstream note that referenced the (now superseded) e1 claim.",
  });

  for (const n of [c1, c2, d1, e1, f1]) writeNode(dir, n);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("thesis (Slice 3 go/no-go): anchoring kills drift", () => {
  it("a real body edit dirties the anchored node, propagates, stops at the superseded wall, and is excluded from current retrieval", () => {
    const nodes = readAll(dir);
    const repoState = repoStateFromFiles({ [BILLING_PATH]: billingV1_bodyEdit, [UTIL_PATH]: utilV0 });

    const result = check(nodes, repoState);

    expect(result.dirty).toEqual(new Set(["c1", "d1", "e1"]));
    expect(result.dirty.has("f1")).toBe(false); // propagation wall: e1 is superseded
    expect(result.dirty.has("c2")).toBe(false); // untouched function: no false positive

    const current = currentNodes(nodes, repoState);
    const currentIds = current.map((n) => n.id).sort();
    expect(currentIds).toEqual(["c2", "f1"]);
    expect(currentIds).not.toContain("c1");
  });

  it("a pure line-move (code inserted above, symbol body untouched) does NOT dirty anything", () => {
    const nodes = readAll(dir);
    const repoState = repoStateFromFiles({ [BILLING_PATH]: billingV1_lineMove, [UTIL_PATH]: utilV0 });

    const result = check(nodes, repoState);

    expect(result.dirty.size).toBe(0);

    const current = currentNodes(nodes, repoState);
    expect(current.map((n) => n.id).sort()).toEqual(["c1", "c2", "d1", "e1", "f1"]);
  });

  it("baseline (no mutation) is fully clean", () => {
    const nodes = readAll(dir);
    const repoState = repoStateFromFiles({ [BILLING_PATH]: billingV0, [UTIL_PATH]: utilV0 });

    expect(check(nodes, repoState).dirty.size).toBe(0);
  });
});
