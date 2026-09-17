# Nocetta

> Anchored, bitemporal memory for coding agents — facts that know when they've gone stale.

Nocetta is a memory system for coding agents built on one load-bearing idea: every fact is
anchored to the code it describes — a tree-sitter locator plus a normalized content hash — so
staleness is detected deterministically, with no LLM in the correctness path. Retrieval resolves
only to live, non-superseded tips, so a stale fact is never served as current. It is a spike: a
from-scratch proof of that idea. Full thesis and competitive wedge in `PLAN.md`; the next-phase
contract in `BACKLOG.md`; sibling project `sandkeep`.

## Thesis

**Anchoring kills drift.** A memory node carries an anchor — a stable locator plus a content
hash — to a real code artifact. When the artifact changes, the hash differs, the node is
marked dirty, and dirtiness propagates to memories that depend on it. Everything is stored
as plain files that are a *sufficient* source of truth: live state is reconstructable from
the files alone, with no database and no runtime.

## The wedge

1. **Deterministic AST-anchored drift detection** — hash diff → dirty. No LLM in the
   correctness path.
2. **Non-destructive supersession + bitemporal history** — never DELETE on contradiction;
   supersede (keep both, add an edge, resolve to tip). Full provenance and as-of queries.
3. **Files as truth** — inspectable, git-diffable, portable. Not a vector index you can't open.
4. **Entity graph grounded in anchors** — entities anchor to content artifacts and support
   retcon-propagation, which a purely conversational graph has no analog for.

## Getting started

MIT (`LICENSE`; contributions per `CLA.md`). Three ways in.

**On Claude Code — the plugin.** The repo is also a Claude Code plugin: one install bundles
the MCP server and the hooks, no `settings.json` editing:

```
/plugin marketplace add asymptopialtd/nocetta
/plugin install nocetta@nocetta
```

`dist/` and `package-lock.json` are committed so the marketplace's frozen, no-scripts
dependency install (`npm ci`) yields a runnable tree — the native grammars ship all-platform
prebuilds, so nothing compiles. Local development on a checkout stays the same:
`pnpm install && pnpm build`, then `claude --plugin-dir /path/to/nocetta`. The plugin is a
thin wrapper: everything it points at is the same MCP server and CLI below.

**On any harness — the MCP server.** Point the client at npm; that's the whole config:

```json
{
  "mcpServers": {
    "nocetta": {
      "command": "npx",
      "args": ["-y", "-p", "nocetta", "nocetta-mcp"]
    }
  }
}
```

The repo root is discovered, not declared — the server walks up from its working directory to
the nearest ancestor holding `.nocetta/` or `.git/`, the way git finds a repo — so one
registration serves every project, and memories land in that project's `.nocetta/memory/`
(committed to the project's git, never anywhere global). `NOCETTA_ROOT` (env) and `--root`
(CLI) are overrides for cross-repo tooling and tests, never a requirement. The six tools'
descriptions teach themselves, and the initialize response carries the workflow contract — no
skill files to install; project-specific rules belong in the project's own `AGENTS.md`.

**In your own tooling and CI — the library + CLI.** `npm i nocetta`; `import { open } from
"nocetta"` hosts the whole loop. The CLI runs as
`node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js` — the flag is load-bearing,
since an installed `dist` sits behind a package-manager symlink.

### 60-second tour

In a repo with a `fetchWithRetry` function in `src/retry.ts`:

1. Capture a claim, anchored to the symbol it describes:

   ```sh
   node --input-type=module -e '
   import { open } from "nocetta";
   const nc = open(process.cwd());
   const { node } = nc.remember({
     body: "fetchWithRetry gives up after 3 attempts, then returns the cached response",
     kind: "claim", artifactPath: "src/retry.ts", symbolName: "fetchWithRetry",
   });
   console.log(node.id, "·", node.anchors[0].locator);
   '
   ```

   → `84e0a983-8dc7-4202-9f37-03db2f53ec25 · src/retry.ts › function fetchWithRetry`
   (ids vary), and a markdown file under `.nocetta/memory/`.

2. Recall by files in play:

   ```sh
   node --input-type=module -e '
   import { open } from "nocetta";
   for (const h of open(process.cwd()).search({ filesInPlay: ["src/retry.ts"] }))
     console.log(h.node.body);
   '
   ```

   → the retry fact, verbatim.

3. Edit `fetchWithRetry`'s body — any change to the function.

4. The gate goes red:

   ```sh
   node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js check --strict
   ```

   ```
   dirty (1):
     84e0a983  hash changed: src/retry.ts › function fetchWithRetry  (file: fetchwithretry-gives-up-after-3-attempts-then-re--84e0a983.md)
   1 nodes · 1 dirty · 0 conflicts · 0 issues
   ```

   Exit 1 — and the fact has already excluded itself from recall. Staleness is
   structural, not a vibe.

5. The meaning survived the edit; the hash didn't. Re-anchor in place — the belief is
   untouched, only its locator and hash are rewritten:

   ```sh
   node --input-type=module -e '
   import { open } from "nocetta";
   open(process.cwd()).reAnchor("84e0a983-8dc7-4202-9f37-03db2f53ec25", { symbolName: "fetchWithRetry" });
   '
   node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js check --strict
   ```

   → `1 nodes · 0 dirty · 0 conflicts · 0 issues`, exit 0.

If the belief itself had changed, supersede; if its subject is gone, retire. Those are
agent moves — the six MCP tools — and the initialize response's instructions teach when
to reach for each.

### For humans

`nocetta ls` browses the store one line per node; each memory is a markdown file under
`.nocetta/memory/` — open them, hand-edit them (reads quarantine what they can't parse), git
them. `.nocetta/INDEX.md` is a generated listing, rewritten on every write — never hand-edit
it.

`nocetta ledger` reads the per-machine recall log (`.nocetta/recall-log.jsonl` — never commit
or share it; nocetta keeps it out of git via a `.nocetta/.gitignore` it maintains itself) and
sorts memories into four quadrants: **working** (surfaced and beyond the code), **redundant**
(surfaced but the code already says it), **dormant** (never surfaced but latent insurance —
kept), and **prunable** (never surfaced and already in the code — the only safe-to-clear
quadrant).

### Hooks (optional)

The plugin wires all of this automatically (`hooks/hooks.json`). Standalone, add hooks to
`settings.json` by hand — one per event:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js hook stop" }] }
    ]
  }
}
```

- **Stop — citation crediting.** Credits every memory whose anchored file the turn just
  edited — the same signal an agent can send manually via `used_ids` on `memory_search`. It
  records; it never speaks back. Add `UserPromptSubmit` → `hook user-prompt-submit` and
  `PreCompact` → `hook pre-compact` the same way (plus a `SessionStart` entry with matcher
  `compact` for hosts without `PreCompact`).
- **Push-recall (`UserPromptSubmit`).** On each prompt, runs a keyword search and — only on a
  genuinely strong, non-repetitive match — injects one memory as dismissible background, never
  phrased as an instruction. Silence is the resting state, kept by three guardrails: an
  absolute relevance floor (`NOCETTA_PUSH_FLOOR`, default `9`, read off sampling this repo's
  own store — adjust only against your own sampling), a cap of one memory per turn, and
  session dedup with a rising bar (injected-then-used stays suppressed for the session;
  injected-and-ignored can re-fire only on a materially stronger score). A prompt that names
  an anchored file bypasses the floor (once per session), and compaction resets the dedup
  window.
- **`NOCETTA_PUSH_OFF=1`** disables push-recall (fail-open no-op), keeping the citation-only
  Stop hook.

### CI

```yaml
memory-gate:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install
    - run: node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js check --strict
```

Dirty memories, unresolved conflicts, or a broken store fail the build.

## Memory file format

One markdown file per memory node, YAML frontmatter + body, under
`.nocetta/memory/<slug>--<id8>.md` (a kebab slug of the body plus the id's first 8
chars — readable in `ls` and `git log`; identity is always the frontmatter `id`):

```yaml
---
id: string                  # stable node id (uuid-like, content-independent)
summary: string              # one-line human preview; recall previews on this before body budget.
                              # Optional — createNode derives a fallback from the body when omitted.
kind: claim | value | entity | lore-fact
scope: string                # e.g. a repo-relative directory, or "global"
anchors:                     # zero or more; claims/lore-facts are typically anchored
  - locator: string          # "path/to/file.ts › class Foo › method bar" (code)
                              # or "path/to/doc.md#Heading" (content-artifact span, Slice 8) —
                              # a Markdown table's data rows are spans too, keyed by their
                              # first cell (e.g. "path/to/doc.md#GAP·stream"), additive to headings
    hash: string              # normalized content hash at write time
    artifactPath: string      # repo-relative path of the anchored artifact
edges:                        # relations to other node ids
  - type: anchored-to | superseded-by | supersedes | restates
    target: string            # node id (anchored-to may instead target an artifact path)
validFrom: string             # ISO 8601 — valid-time start
validTo: string | null        # ISO 8601 — valid-time end (null = still valid)
txnTime: string                # ISO 8601 — append-only write (transaction) time
authority: invariant | default
overrideReason: string | null # set only when a `default` authority is overridden
retiredReason: string | null  # set only when retire() closed the node — why its valid-time window shut
version: number               # frontmatter format version (createNode stamps 1)
commit: string                # optional: the git commit this fact ties to — stored/surfaced only, never interpreted
---

Body text (prose). For `claim`/`lore-fact` nodes this is the asserted content; for `value`
nodes this is the decision/value itself; for `entity` nodes this is the canonical name plus
alias list.
```

Rules that make the format load-bearing (not decorative):

- The frontmatter is the **complete** representation of a node's identity, anchors, edges,
  and temporal state. Any in-memory index (reverse anchor→memories, BM25, etc.) is a
  **rebuildable fold** over these files — never a second source of truth.
- Writes go through a **single choke point** (`writeNode`, Slice 2) so cross-cutting gates
  (e.g. the never-leak secret gate, Slice 7) apply everywhere without touching call sites.
- `superseded-by` / `supersedes` form an acyclic DAG (fan-in allowed); `anchored-to` is a
  separate relation with separate traversal semantics — dirty-propagation follows
  `anchored-to` and stops at superseded nodes.

## Development

```sh
pnpm install
pnpm test
```

Stack: TypeScript (strict, ESM/NodeNext), tree-sitter (wasm grammars for
TypeScript/JavaScript, Python, and Go; native `tree-sitter` for GDScript;
symbol locator + normalized content hash), `js-yaml` for frontmatter, `vitest`
for tests. No database, no server, no LLM on the correctness path.
