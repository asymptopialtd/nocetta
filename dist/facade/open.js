import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { asOf } from "../bitemporal/as-of.js";
import { remember } from "../capture/remember.js";
import { check } from "../drift/check.js";
import { contextTriggered, searchMemory } from "../retrieval/search.js";
import { reAnchor } from "../repair/re-anchor.js";
import { retire } from "../repair/retire.js";
import { findConflicts } from "../supersede/conflicts.js";
import { findDuplicates } from "../supersede/duplicates.js";
import { overrideValue } from "../supersede/override.js";
import { supersede } from "../supersede/supersede.js";
import { isCurrent, writeIndex } from "../store/index-file.js";
import { filenameFor, readStore, writeNode } from "../store/store.js";
/** Canonical store layout: every memory lives in `<repoRoot>/.nocetta/memory`. */
export const MEMORY_DIR = ".nocetta/memory";
/**
 * The loader that kills the forgotten-file error class: it reads exactly the
 * anchored artifactPath set — never a repo walk (unanchored files would fake
 * coverage), never a hand-assembled list (a forgotten entry hides stale dirt).
 * An artifact that doesn't exist stays absent from the map, so check()
 * reports "artifact missing" instead of the loader substituting a guess.
 */
export function loadRepoState(repoRoot, nodes) {
    const state = new Map();
    for (const node of nodes) {
        for (const anchor of node.anchors) {
            if (state.has(anchor.artifactPath))
                continue; // one read per path, not per anchor
            try {
                state.set(anchor.artifactPath, readFileSync(join(repoRoot, anchor.artifactPath), "utf8"));
            }
            catch {
                // deliberately absent — an honest miss, not a guess
            }
        }
    }
    return state;
}
/** The tip lands first: if the never-leak gate refuses it, the old fact
 * stands untouched — a supersession never tears (same write order as
 * capture/remember). */
function persistSupersession(memoryDir, result) {
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
export function open(repoRoot, opts = {}) {
    const memoryDir = join(repoRoot, MEMORY_DIR);
    // The store root is MEMORY_DIR's parent, derived rather than a second
    // hardcoded layout — INDEX.md lives there, never inside MEMORY_DIR itself,
    // or readStore would try to parse it as a node.
    const storeRoot = dirname(memoryDir);
    const locator = opts.locator;
    let cache = [];
    let quarantined = [];
    const reload = () => {
        const read = readStore(memoryDir);
        cache = read.nodes;
        quarantined = read.issues;
    };
    reload();
    // Regenerate the human-facing index (decision 162d74f3) after every
    // mutation reloads the cache — fully rewritten from the current node set,
    // never hand-maintained, so it can never go stale.
    const regenerateIndex = () => writeIndex(storeRoot, cache);
    return {
        repoRoot,
        reload,
        nodes() {
            return cache;
        },
        issues() {
            return quarantined;
        },
        search(q) {
            return searchMemory(cache, loadRepoState(repoRoot, cache), q, locator);
        },
        contextTrigger(files, contextOpts = {}) {
            return contextTriggered(cache, loadRepoState(repoRoot, cache), files, contextOpts, locator);
        },
        remember(req) {
            const result = remember(memoryDir, cache, req, { repoRoot });
            reload();
            regenerateIndex();
            // Repo-relative, forward-slash always: MEMORY_DIR is already posix and
            // filenameFor never emits separators, so string concatenation (not
            // path.join, which would go backslash on Windows) is the honest
            // relative path an agent hands straight to `git add`.
            return { ...result, file: `${MEMORY_DIR}/${filenameFor(result.node)}` };
        },
        supersede(oldId, next, supersedeOpts) {
            const result = supersede(cache, oldId, next, supersedeOpts);
            persistSupersession(memoryDir, result);
            reload();
            regenerateIndex();
            return result;
        },
        override(oldId, next, reason, overrideOpts) {
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
        worklist(worklistOpts = {}) {
            const now = worklistOpts.now ?? new Date().toISOString();
            const live = cache.filter((n) => isCurrent(n, now));
            const { dirty, reasons } = check(live, loadRepoState(repoRoot, live), locator);
            const byId = new Map(live.map((n) => [n.id, n]));
            return {
                dirty: [...dirty]
                    .map((id) => ({ node: byId.get(id), reason: reasons.get(id) }))
                    .sort((a, b) => a.node.id.localeCompare(b.node.id)),
                conflicts: findConflicts(live),
                duplicates: findDuplicates(live),
            };
        },
        reAnchor(nodeId, req) {
            const repaired = reAnchor(memoryDir, cache, nodeId, req, { repoRoot });
            reload();
            regenerateIndex();
            return repaired;
        },
        retire(nodeId, reason) {
            const retired = retire(memoryDir, cache, nodeId, reason);
            reload();
            regenerateIndex();
            return retired;
        },
        asOf(atTxnTime) {
            return asOf(cache, atTxnTime);
        },
    };
}
