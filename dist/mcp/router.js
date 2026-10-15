import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "../facade/open.js";
import { isBareMultiRepoParent, resolveRoot, resolveRootFromArtifact } from "../facade/root.js";
const STORE_MARKER = ".nocetta";
const GIT_MARKER = ".git";
/**
 * Per-write store resolution for the long-lived MCP server. The server is
 * launched ONCE — often at a parent directory holding many child project repos
 * — but each belief must land in the right project's committed `.nocetta/`
 * store. So the root is resolved per call, from the write itself, never from a
 * single launch-time constant:
 *
 * - override (NOCETTA_ROOT / --root) → that root for everything, path unchanged;
 * - anchored (an artifactPath): walk up from the artifact's own location
 *   (resolveRootFromArtifact), and record the path relative to that store;
 * - unanchored / default (no path hint): the client's advertised roots — one
 *   root wins, several collapse to the single `.git`/`.nocetta` one or else
 *   refuse as ambiguous; no roots capability falls back to discovery from base.
 *
 * Every resolved root passes the bare-multi-repo-parent guard before use, so a
 * write can never silently fragment memory into `<parent>/.nocetta`.
 *
 * Facades are cached per root — one `open()` (one store read) per project the
 * server touches, reused across calls; each facade reloads itself on mutation.
 */
export class StoreRouter {
    base;
    override;
    listRoots;
    openStore;
    cache = new Map();
    constructor(opts = {}) {
        this.base = opts.base ?? process.cwd();
        this.override = opts.override;
        this.listRoots = opts.listRoots;
        this.openStore = opts.openStore ?? open;
    }
    facadeFor(root) {
        let nc = this.cache.get(root);
        if (nc === undefined) {
            nc = this.openStore(root);
            this.cache.set(root, nc);
        }
        return nc;
    }
    /**
     * Refuse a root that is a bare directory holding child project repos — the
     * exact shape that planted a shared store at the parent. The override is
     * exempt: an explicit root is a deliberate choice, honoured verbatim.
     */
    guard(root) {
        if (root === this.override)
            return;
        if (isBareMultiRepoParent(root)) {
            throw new Error(`nocetta: "${root}" is not a project — it is a directory holding separate project repos, ` +
                "so a single store here would fragment memory away from each project. " +
                "Anchor the belief (artifact_path) so it routes to its project, set NOCETTA_ROOT to the intended project, " +
                "or launch the server from inside the project.");
        }
    }
    /** The facade for an anchored write/read, resolved from the artifact it names
     * and with the artifactPath rewritten relative to the resolved store. */
    forArtifact(artifactPath) {
        if (this.override !== undefined) {
            return { nc: this.facadeFor(this.override), artifactPath };
        }
        const resolved = resolveRootFromArtifact(this.base, artifactPath);
        this.guard(resolved.root);
        return { nc: this.facadeFor(resolved.root), artifactPath: resolved.artifactPath };
    }
    /** The facade for a files_in_play read: routed by the first path (anchors in
     * other projects' stores wouldn't match anyway), with every path rewritten
     * relative to that store so the reverse index can match them. */
    forFiles(files) {
        if (this.override !== undefined || files.length === 0) {
            const root = this.override ?? resolveRoot({ from: this.base });
            this.guard(root);
            return { nc: this.facadeFor(root), files };
        }
        const resolved = resolveRootFromArtifact(this.base, files[0]);
        this.guard(resolved.root);
        // Every path re-expressed relative to the chosen store: ones inside it
        // match its reverse index, ones elsewhere become a `..`-path that matches
        // nothing (harmless — a file in another project has no anchor here anyway).
        const rebased = files.map((f) => relative(resolved.root, resolve(this.base, f)).split("\\").join("/"));
        return { nc: this.facadeFor(resolved.root), files: rebased };
    }
    /** The facade for an unanchored write or any path-less tool (keyword search,
     * worklist, supersede, repair, as_of). */
    async forDefault() {
        const root = await this.resolveDefaultRoot();
        this.guard(root);
        return { nc: this.facadeFor(root) };
    }
    async resolveDefaultRoot() {
        if (this.override !== undefined)
            return this.override;
        if (this.listRoots !== undefined) {
            let roots = [];
            try {
                roots = await this.listRoots();
            }
            catch {
                roots = []; // client declined / doesn't support roots: fall through to discovery
            }
            if (roots.length === 1)
                return roots[0];
            if (roots.length > 1) {
                const projects = roots.filter((r) => existsSync(join(r, STORE_MARKER)) || existsSync(join(r, GIT_MARKER)));
                if (projects.length === 1)
                    return projects[0];
                throw new Error(`nocetta: the client advertises ${roots.length} workspace roots and this belief is unanchored, ` +
                    `so the project is ambiguous (${projects.length} are project repos). ` +
                    "Anchor the belief (artifact_path) to route it, or set NOCETTA_ROOT to the intended project.");
            }
        }
        return resolveRoot({ from: this.base });
    }
}
/** A `listRoots` closure over an MCP server: returns the client's advertised
 * roots as filesystem paths, or an empty list when the client doesn't support
 * the capability — so the router falls back to discovery rather than erroring. */
export function clientRootsFrom(server) {
    return async () => {
        if (server.getClientCapabilities()?.roots === undefined)
            return [];
        const { roots } = await server.listRoots();
        return roots
            .map((r) => {
            try {
                return r.uri.startsWith("file:") ? fileURLToPath(r.uri) : r.uri;
            }
            catch {
                return undefined;
            }
        })
            .filter((p) => p !== undefined);
    };
}
