import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanForSecrets } from "../safety/never-leak.js";
import { parseNode, serializeNode } from "./serialize.js";
import type { MemoryNode } from "./types.js";

export class NeverLeakError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly violations: string[],
  ) {
    super(`refusing to write node "${nodeId}": ${violations.join("; ")}`);
    this.name = "NeverLeakError";
  }
}

/**
 * The single write choke-point for memory nodes. Every write in this codebase
 * goes through here, so cross-cutting gates — the never-leak secret gate
 * (Slice 7) chief among them — apply everywhere without touching call sites.
 */
export function writeNode(dir: string, node: MemoryNode): void {
  const violations = scanForSecrets(node);
  if (violations.length > 0) throw new NeverLeakError(node.id, violations);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${node.id}.md`), serializeNode(node), "utf8");
}

/** Read every memory node back from disk. Files are the complete source of truth. */
export function readAll(dir: string): MemoryNode[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => parseNode(readFileSync(join(dir, name), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Rebuildable fold: artifact path → ids of memory nodes anchored to it.
 * Never a second source of truth — always derivable from `readAll`.
 */
export function buildReverseIndex(nodes: MemoryNode[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const anchor of node.anchors) {
      const ids = index.get(anchor.artifactPath) ?? new Set<string>();
      ids.add(node.id);
      index.set(anchor.artifactPath, ids);
    }
  }
  return index;
}
