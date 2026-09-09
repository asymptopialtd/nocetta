import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SymbolLocator } from "../anchor/locator.js";
import { asOf } from "../bitemporal/as-of.js";
import { remember } from "../capture/remember.js";
import type { RememberRequest } from "../capture/remember.js";
import { check } from "../drift/check.js";
import type { RepoState } from "../drift/repo-state.js";
import { contextTriggered, searchMemory } from "../retrieval/search.js";
import type { SearchQuery, SearchResult } from "../retrieval/types.js";
import { reAnchor } from "../repair/re-anchor.js";
import type { ReAnchorRequest } from "../repair/re-anchor.js";
import { retire } from "../repair/retire.js";
import { findConflicts } from "../supersede/conflicts.js";
import type { Conflict } from "../supersede/conflicts.js";
import { findDuplicates } from "../supersede/duplicates.js";
import type { Duplicate } from "../supersede/duplicates.js";
import { overrideValue } from "../supersede/override.js";
import { supersede } from "../supersede/supersede.js";
import type { SupersedeOptions } from "../supersede/supersede.js";
import { isCurrent, writeIndex } from "../store/index-file.js";
import { filenameFor, readStore, writeNode } from "../store/store.js";
import type { StoreIssue } from "../store/store.js";
import type { MemoryNode } from "../store/types.js";

/** Canonical store layout: every memory lives in `<repoRoot>/.nocetta/memory`. */
export const MEMORY_DIR = ".nocetta/memory";

export interface OpenOptions {
  /** Injected code parser; defaults to nocetta's built-in tree-sitter locator.
   * Threads into search/contextTrigger and the worklist's drift check. */
  locator?: SymbolLocator;
}

/**
 * One "what needs attention" surface: drift (reason verbatim), cross-authority
 * conflicts, and duplicate pairs. It reports; it does not repair — the
 * facade's reAnchor/retire/supersede are the actions that close what this
 * list opens.
 */
export interface Worklist {
  dirty: { node: MemoryNode; reason: string }[];
  conflicts: Conflict[];
  /** Live beliefs that say the same thing — the accretion a warning-ignoring
   * capture leaves behind. Converged by superseding one side. */
  duplicates: Duplicate[];
}

/**
 * The whole loop behind one object. The engine's functions stay pure
 * `(nodes[], repoState, ...)`; this is the stateful shell a host actually
 * holds — capture → recall → drift → repair in a single handle, with the
 * store location derived from repoRoot instead of threaded through every call.
 */
export interface Nocetta {
  readonly repoRoot: string;
  /** Re-read the store from disk. Explicit by design — no file watchers. */
  reload(): void;
  /** The current in-memory node set — a rebuildable fold over the files. */
  nodes(): MemoryNode[];
  /** The quarantine report from the last read: hand-broken store files that
   * were skipped (with a reason), never deleted — files are truth, the report
   * is advice. Refreshed by reload() and by every mutation (which reloads). */
  issues(): StoreIssue[];
  search(q: SearchQuery): SearchResult[];
  contextTrigger(
    files: string[],
    opts?: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars">,
  ): SearchResult[];
  remember(req: RememberRequest): { node: MemoryNode; superseded: MemoryNode | null; warnings: string[]; file: string };
  supersede(oldId: string, next: MemoryNode, opts?: SupersedeOptions): { old: MemoryNode; next: MemoryNode };
  override(oldId: string, next: MemoryNode, reason: string, opts?: SupersedeOptions): { old: MemoryNode; next: MemoryNode };
  worklist(opts?: { now?: string }): Worklist;
  /** Identity repair, in place: the node's matching anchor is re-resolved
   * against the artifact's current source (the same exact-match machinery as
   * remember) and its locator+hash rewritten. Body and valid-time window are
   * untouched — the belief didn't change. */
  reAnchor(nodeId: string, req: ReAnchorRequest): MemoryNode;
  /** Close the node's valid-time window (validTo = now) and record the
   * mandatory reason. Not a supersession: the node simply leaves "current"
   * and stays visible to asOf. */
  retire(nodeId: string, reason: string): MemoryNode;
  asOf(atTxnTime: string): MemoryNode[];
}

/**
 * The loader that kills the forgotten-file error class: it reads exactly the
 * anchored artifactPath set — never a repo walk (unanchored files would fake
 * coverage), never a hand-assembled list (a forgotten entry hides stale dirt).
 * An artifact that doesn't exist stays absent from the map, so check()
 * reports "artifact missing" instead of the loader substituting a guess.
 */
export function loadRepoState(repoRoot: string, nodes: readonly MemoryNode[]): RepoState {
  const state = new Map<string, string>();
  for (const node of nodes) {
    for (const anchor of node.anchors) {
      if (state.has(anchor.artifactPath)) continue; // one read per path, not per anchor
      try {
        state.set(anchor.artifactPath, readFileSync(join(repoRoot, anchor.artifactPath), "utf8"));
      } catch {
        // deliberately absent — an honest miss, not a guess
      }
    }
  }
  return state;
}

/** The tip lands first: if the never-leak gate refuses it, the old fact
 * stands untouched — a supersession never tears (same write order as
 * capture/remember). */
function persistSupersession(memoryDir: string, result: { old: MemoryNode; next: MemoryNode }): void {
  writeNode(memoryDir, result.next);
  writeNode(memoryDir, result.old);
}

/**
 * Read the store once and hand back the loop. Queries rebuild their repo
 * state per call from the anchored set (caching is Seam 10 and stays unbuilt
 * until measured); mutations persist through the engine's own functions —
 * writeNode remains the only writer — and then the cache is rebuilt from
 * disk rather than patched in place: one code path maintains the fold, so
 * the in-memory set cannot disagree with what was actually persisted.
 */
export function open(repoRoot: string, opts: OpenOptions = {}): Nocetta {
  const memoryDir = join(repoRoot, MEMORY_DIR);
  // The store root is MEMORY_DIR's parent, derived rather than a second
  // hardcoded layout — INDEX.md lives there, never inside MEMORY_DIR itself,
  // or readStore would try to parse it as a node.
  const storeRoot = dirname(memoryDir);
  const locator = opts.locator;

  let cache: MemoryNode[] = [];
  let quarantined: StoreIssue[] = [];
  const reload = (): void => {
    const read = readStore(memoryDir);
    cache = read.nodes;
    quarantined = read.issues;
  };
  reload();

  // Regenerate the human-facing index (decision 162d74f3) after every
  // mutation reloads the cache — fully rewritten from the current node set,
  // never hand-maintained, so it can never go stale.
  const regenerateIndex = (): void => writeIndex(storeRoot, cache);

  return {
    repoRoot,

    reload,

    nodes(): MemoryNode[] {
      return cache;
    },

    issues(): StoreIssue[] {
      return quarantined;
    },

    search(q: SearchQuery): SearchResult[] {
      return searchMemory(cache, loadRepoState(repoRoot, cache), q, locator);
    },

    contextTrigger(
      files: string[],
      contextOpts: Pick<SearchQuery, "scope" | "now" | "maxResults" | "maxBodyChars"> = {},
    ): SearchResult[] {
      return contextTriggered(cache, loadRepoState(repoRoot, cache), files, contextOpts, locator);
    },

    remember(req: RememberRequest): { node: MemoryNode; superseded: MemoryNode | null; warnings: string[]; file: string } {
      const result = remember(memoryDir, cache, req, { repoRoot });
      reload();
      regenerateIndex();
      // Repo-relative, forward-slash always: MEMORY_DIR is already posix and
      // filenameFor never emits separators, so string concatenation (not
      // path.join, which would go backslash on Windows) is the honest
      // relative path an agent hands straight to `git add`.
      return { ...result, file: `${MEMORY_DIR}/${filenameFor(result.node)}` };
    },

    supersede(oldId: string, next: MemoryNode, supersedeOpts?: SupersedeOptions): { old: MemoryNode; next: MemoryNode } {
      const result = supersede(cache, oldId, next, supersedeOpts);
      persistSupersession(memoryDir, result);
      reload();
      regenerateIndex();
      return result;
    },

    override(oldId: string, next: MemoryNode, reason: string, overrideOpts?: SupersedeOptions): { old: MemoryNode; next: MemoryNode } {
      const result = overrideValue(cache, oldId, next, reason, overrideOpts);
      persistSupersession(memoryDir, result);
      reload();
      regenerateIndex();
      return result;
    },

    // The worklist reports the CURRENT view's problems, and only those: dead
    // beliefs (superseded; retired/expired) need no attention, and reporting
    // them is how a worklist trains its reader to ignore it — reAnchor already
    // refuses them, so each dead entry is advice the agent cannot act on.
    // `now` bounds the validity window; deterministic tests pass it explicitly.
    worklist(worklistOpts: { now?: string } = {}): Worklist {
      const now = worklistOpts.now ?? new Date().toISOString();
      const live = cache.filter((n) => isCurrent(n, now));
      const { dirty, reasons } = check(live, loadRepoState(repoRoot, live), locator);
      const byId = new Map(live.map((n) => [n.id, n]));
      return {
        dirty: [...dirty]
          .map((id) => ({ node: byId.get(id)!, reason: reasons.get(id)! }))
          .sort((a, b) => a.node.id.localeCompare(b.node.id)),
        conflicts: findConflicts(live),
        duplicates: findDuplicates(live),
      };
    },

    reAnchor(nodeId: string, req: ReAnchorRequest): MemoryNode {
      const repaired = reAnchor(memoryDir, cache, nodeId, req, { repoRoot });
      reload();
      regenerateIndex();
      return repaired;
    },

    retire(nodeId: string, reason: string): MemoryNode {
      const retired = retire(memoryDir, cache, nodeId, reason);
      reload();
      regenerateIndex();
      return retired;
    },

    asOf(atTxnTime: string): MemoryNode[] {
      return asOf(cache, atTxnTime);
    },
  };
}
