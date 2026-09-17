import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
 */
export function resolveRoot(opts = {}) {
    const start = resolve(opts.from ?? process.cwd());
    if (opts.explicit !== undefined)
        return resolve(start, opts.explicit);
    let current = start;
    for (;;) {
        if (existsSync(join(current, STORE_MARKER)))
            return current;
        if (existsSync(join(current, GIT_MARKER)))
            return current;
        const parent = dirname(current);
        if (parent === current)
            return start; // filesystem root: no markers anywhere, stay put
        current = parent;
    }
}
