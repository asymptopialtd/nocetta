import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/anchor/index.js";
import type { RepoState } from "../../src/drift/repo-state.js";
import { repoStateFromFiles } from "../../src/drift/repo-state.js";
import { filterLive, resolveToTip } from "../../src/retrieval/pipeline.js";
import { buildReverseIndex, readAll, writeNode } from "../../src/store/index.js";
import { supersede } from "../../src/supersede/supersede.js";
import type { MemoryNode } from "../../src/store/types.js";

/** The full "current" view of the whole graph: every node resolved to its
 * supersession tip, then filtered live (scope/window/dirty) — same stages
 * the retrieval pipeline uses, just not scoped to any particular file set. */
function liveCurrentView(nodes: MemoryNode[], repoState: RepoState): MemoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const asCandidates = nodes.map((n) => ({ node: n, matchedFiles: new Set<string>() }));
  const resolved = resolveToTip(asCandidates, byId);
  return filterLive(resolved, { nodes, repoState }).map((c) => c.node);
}

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
    body: "body",
    ...overrides,
  };
}

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

describe("files-sufficient portability proof", () => {
  it("reconstructs identical live 'current' state after tarring, wiping, and re-extracting — no index survives", () => {
    const originalDir = freshDir("nocetta-portability-src-");

    const billingPath = "src/billing.ts";
    const billingSource = "export function calculateTotal(): number {\n  return 1;\n}\n";
    const hash = extractSymbols(billingPath, billingSource)[0]!.hash;

    const claim = node({
      id: "claim1",
      anchors: [{ locator: `${billingPath} › function calculateTotal`, hash, artifactPath: billingPath }],
      body: "calculateTotal returns the invoice total.",
    });
    const decision = node({
      id: "decision1",
      kind: "value",
      authority: "invariant",
      edges: [{ type: "anchored-to", target: "claim1" }],
      body: "totals are always computed server-side.",
    });
    const oldClaim = node({ id: "old1", body: "an earlier, now-superseded claim" });
    const { old: supersededOld, next: newClaim } = supersede([oldClaim], "old1", node({ id: "new1", body: "the current claim" }));

    for (const n of [claim, decision, supersededOld, newClaim]) writeNode(originalDir, n);

    const repoState = repoStateFromFiles({ [billingPath]: billingSource });
    const nodesBefore = readAll(originalDir);
    const currentBefore = liveCurrentView(nodesBefore, repoState);
    const indexBefore = buildReverseIndex(nodesBefore);

    // tar the memory directory, then wipe it completely — nothing survives
    // but the archive itself.
    const tarPath = join(tmpdir(), `nocetta-portability-${process.pid}-${Date.now()}.tar`);
    execFileSync("tar", ["-cf", tarPath, "-C", originalDir, "."]);
    rmSync(originalDir, { recursive: true, force: true });

    const restoredDir = freshDir("nocetta-portability-dst-");
    execFileSync("tar", ["-xf", tarPath, "-C", restoredDir]);
    rmSync(tarPath, { force: true });

    const nodesAfter = readAll(restoredDir);
    const currentAfter = liveCurrentView(nodesAfter, repoState);
    const indexAfter = buildReverseIndex(nodesAfter);

    expect(nodesAfter).toEqual(nodesBefore);
    expect(currentAfter).toEqual(currentBefore);
    expect(indexAfter).toEqual(indexBefore);

    // sanity: the reconstructed "current" view resolved the supersession
    // (old1 replaced by new1, not returned as-is).
    expect(currentAfter.map((n) => n.id).sort()).toEqual(["claim1", "decision1", "new1"]);
  });
});
