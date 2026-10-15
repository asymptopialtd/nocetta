import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const STORE_MARKER = ".nocetta";
const GIT_MARKER = ".git";

/**
 * Where the store lives, resolved the way git resolves a repo: by walking up,
 * not by being told. `NOCETTA_ROOT` (MCP) and `--root` (CLI) are overrides for
 * cross-repo tooling and tests — never a requirement. One globally-registered
 * server must serve every project, so ambient discovery is the default path:
 *
 * 1. the nearest ancestor holding `.nocetta/` — an existing store wins over
 *    everything below it (a nested project inside a bigger repo keeps its own);
 * 2. else the nearest ancestor holding `.git/` — the project boundary, where a
 *    first write will create the store (writeNode mkdir -p's it);
 * 3. else the starting directory itself.
 *
 * Per-level order matters: at any level an existing store beats a git marker,
 * but the NEAREST level wins overall — a monorepo's root store does not
 * swallow a subproject's.
 *
 * This is the per-DIRECTORY answer. The long-lived MCP server resolves PER
 * WRITE instead (see mcp/router.ts): the directory this walk starts from is
 * chosen from the write itself — an anchored write's artifactPath, or the MCP
 * client's advertised workspace roots — so a server launched at a parent
 * holding many child repos still routes each belief to the right project.
 */
export function resolveRoot(opts: { explicit?: string; from?: string } = {}): string {
  const start = resolve(opts.from ?? process.cwd());
  if (opts.explicit !== undefined) return resolve(start, opts.explicit);

  let current = start;
  for (;;) {
    if (existsSync(join(current, STORE_MARKER))) return current;
    if (existsSync(join(current, GIT_MARKER))) return current;
    const parent = dirname(current);
    if (parent === current) return start; // filesystem root: no markers anywhere, stay put
    current = parent;
  }
}

/**
 * The store an anchored write belongs to, resolved from the artifact it names
 * rather than from the server's launch directory. `artifactPath` is whatever
 * the caller passed (relative to `base` — the server's launch cwd — or
 * absolute); we resolve it to a real file and walk up from its directory with
 * the same discovery as resolveRoot. In the failure this exists to fix the
 * caller passed `incremental_egyptian/ui/duat/duat_foe.gd` from a parent cwd,
 * and this lands on `incremental_egyptian` (its `.git`), never the parent.
 *
 * Returns both the resolved store root and the artifactPath re-expressed
 * relative to THAT root (posix): a belief's stored path is always relative to
 * its own store, so routing the write to the right store must also rewrite the
 * path it records.
 */
export function resolveRootFromArtifact(base: string, artifactPath: string): { root: string; artifactPath: string } {
  const absFile = resolve(base, artifactPath);
  const root = resolveRoot({ from: dirname(absFile) });
  const rel = relative(root, absFile).split("\\").join("/");
  return { root, artifactPath: rel };
}

/**
 * The guard that would have caught the original bug: true when `dir` is a bare
 * directory — neither a `.nocetta/` store nor a `.git/` repo — that nonetheless
 * holds one or more child projects (an immediate subdirectory with `.git/` or
 * `.nocetta/`). Writing a store HERE fragments memory away from every child
 * project, so resolution that lands on such a directory must refuse rather than
 * silently create `<parent>/.nocetta`.
 */
export function isBareMultiRepoParent(dir: string): boolean {
  if (existsSync(join(dir, STORE_MARKER)) || existsSync(join(dir, GIT_MARKER))) return false;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false; // unreadable dir: not our call to make, let the normal path error
  }
  for (const name of entries) {
    const child = join(dir, name);
    if (existsSync(join(child, GIT_MARKER)) || existsSync(join(child, STORE_MARKER))) return true;
  }
  return false;
}
