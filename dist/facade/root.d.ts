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
export declare function resolveRoot(opts?: {
    explicit?: string;
    from?: string;
}): string;
