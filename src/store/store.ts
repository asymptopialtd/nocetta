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
 * The filename is a label for humans; identity is the frontmatter id. A
 * kebab slug of the body makes `ls` and `git log --stat` on the store
 * readable; the id's first 8 chars keep names unique and traceable back to
 * the id without ever parsing frontmatter. Derived, not stored — renaming a
 * body never renames an existing file (supersession writes a new node
 * anyway), so the name is stable for a node's file's lifetime.
 */
export function filenameFor(node: MemoryNode): string {
  const slug =
    node.body
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "memory";
  return `${slug}--${node.id.slice(0, 8)}.md`;
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
  writeFileSync(join(dir, filenameFor(node)), serializeNode(node), "utf8");
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
