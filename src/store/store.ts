import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanForSecrets } from "../safety/never-leak.js";
import { parseNode, serializeNode } from "./serialize.js";
import type { MemoryNode } from "./types.js";
import { validateNode } from "./validate.js";

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
 * A defensive copy with every anchor artifactPath in posix form: a store
 * written on Windows round-trips to any other OS (artifact paths are matched
 * textually by drift checks and the reverse index), posix paths pass through
 * untouched. The caller's node is never mutated — their in-memory graph stays
 * exactly as they built it.
 */
function withPosixArtifactPaths(node: MemoryNode): MemoryNode {
  return {
    ...node,
    anchors: node.anchors.map((anchor) =>
      anchor.artifactPath.includes("\\") ? { ...anchor, artifactPath: anchor.artifactPath.replaceAll("\\", "/") } : anchor,
    ),
  };
}

/**
 * The single write choke-point for memory nodes. Every write in this codebase
 * goes through here, so cross-cutting gates — the never-leak secret gate
 * (Slice 7) chief among them — apply everywhere without touching call sites.
 *
 * The bytes land on a same-directory temp file first, then rename into place:
 * concurrent agent sessions are the norm, so a reader must never observe a
 * half-written memory file. The worst case of a mid-write crash is an orphaned
 * temp file, which reads ignore (they take .md only) and git diffs as noise.
 */
export function writeNode(dir: string, node: MemoryNode): void {
  const violations = scanForSecrets(node);
  if (violations.length > 0) throw new NeverLeakError(node.id, violations);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = join(dir, filenameFor(node));
  // pid + timestamp: two writers in one directory cannot stage onto the same
  // temp file, and the leading dot keeps accidents out of `ls`.
  const staged = join(dir, `.${filenameFor(node)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(staged, serializeNode(withPosixArtifactPaths(node)), "utf8");
    renameSync(staged, filename);
  } catch (err) {
    // rename either happened or left the target untouched, so the staged temp
    // is ours to drop — best effort, and never a mask for the real error.
    try {
      rmSync(staged, { force: true });
    } catch {
      // orphaned temp file; harmless to reads
    }
    throw err;
  }
}

export interface StoreIssue {
  /** File name, not full path — e.g. "broken--abc123.md". */
  file: string;
  /** The first problem found, human-readable — e.g. `unknown kind: "decision"`. */
  reason: string;
}

/**
 * Read the whole store, quarantining what fails to parse or validate. A
 * human may be mid-edit — files are truth, the report is advice — so a bad
 * file is reported and skipped, never thrown over and never deleted or moved
 * behind their back. The good nodes always read. One issue per bad file, with
 * the first validation problem as its reason: fixing what it names surfaces
 * the rest, and the file is already open in the human's editor.
 */
export function readStore(dir: string): { nodes: MemoryNode[]; issues: StoreIssue[] } {
  if (!existsSync(dir)) return { nodes: [], issues: [] };
  const nodes: MemoryNode[] = [];
  const issues: StoreIssue[] = [];
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort();
  for (const name of names) {
    try {
      const parsed = parseNode(readFileSync(join(dir, name), "utf8"));
      const [firstProblem] = validateNode(parsed);
      if (firstProblem === undefined) nodes.push(parsed);
      else issues.push({ file: name, reason: firstProblem });
    } catch (err) {
      // Only the first message line: js-yaml appends a multi-line code frame
      // that would drown the report.
      const message = err instanceof Error ? err.message : String(err);
      issues.push({ file: name, reason: message.split("\n")[0] ?? message });
    }
  }
  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    issues: issues.sort((a, b) => a.file.localeCompare(b.file)),
  };
}

/**
 * The nodes-only projection of readStore — quarantined files are skipped, not
 * thrown. Kept as the every-caller entry point so existing reads are unchanged.
 * Files are the complete source of truth.
 */
export function readAll(dir: string): MemoryNode[] {
  return readStore(dir).nodes;
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
