# Nocetta

> Anchored, bitemporal memory for coding agents — facts that know when they've gone stale.

Nocetta is an anchored, bitemporal, DAG memory system for coding agents. It is a spike:
a from-scratch proof that a memory node tied to a real code artifact (a symbol, located
by tree-sitter, with a normalized content hash) can detect its own staleness deterministically
— no LLM in the correctness path — and that retrieval can resolve to a live, non-superseded
tip instead of ever serving a stale fact as current.

Sibling project to `sandkeep`. Positioned against Mem0 (vector retrieval + LLM-judged
ADD/UPDATE/DELETE, destructive on contradiction, no code anchoring) and Zep/Graphiti
(bitemporal knowledge graph, but still no code anchor). See `PLAN.md` for the full thesis,
the competitive wedge, and the slice-by-slice build contract this repo implements.
`BACKLOG.md` is the contract for the next phase: guiding lights + the seam-by-seam
path from proven spike to droppable memory.

## Thesis

**Anchoring kills drift.** A memory node carries an anchor — a stable locator plus a content
hash — to a real code artifact. When the artifact changes, the hash differs, the node is
marked dirty, and dirtiness propagates to memories that depend on it. Retrieval resolves to
the live tip of a supersession chain, so a stale fact is never served as current. Everything
is stored as plain files that are a *sufficient* source of truth: live state is reconstructable
from the files alone, with no database and no runtime.

## The wedge

1. **Deterministic AST-anchored drift detection** — hash diff → dirty. No LLM in the
   correctness path.
2. **Non-destructive supersession + bitemporal history** — never DELETE on contradiction;
   supersede (keep both, add an edge, resolve to tip). Full provenance and as-of queries.
3. **Files as truth** — inspectable, git-diffable, portable. Not a vector index you can't open.
4. **Entity graph grounded in anchors** — entities anchor to content artifacts and support
   retcon-propagation, which a purely conversational graph has no analog for.

## Getting started

Nocetta is closed source for now (`private: true`, UNLICENSED): it ships as a tarball to
trusted projects — `pnpm pack` in a checkout, then a `file:` install or a private registry
(see BACKLOG.md for the posture). Three ways in:

**On Claude Code — the plugin (easiest).** The repo is also a Claude Code plugin: its
`.claude-plugin/plugin.json` bundles the MCP server (`nocetta.mcp.json`) and the citation
Stop hook (`hooks/hooks.json`), so one install wires both — no `settings.json` editing.
Point Claude Code at a built checkout with `claude --plugin-dir /path/to/nocetta`, or serve
it from a private marketplace. The plugin is a thin wrapper: everything it points at is the
same portable MCP server and CLI below, so nothing here is Claude-Code-only except the
auto-wiring itself.

**For an agent on any harness — the MCP server.** Point an MCP client at the dist; that's the whole
config. The repo root is *discovered*, not declared — the server walks up from its
working directory to the nearest ancestor holding `.nocetta/` or `.git/`, the way git
finds a repo — so one registration serves every project, and memories always land in
that project's `<repo>/.nocetta/memory/` (committed to the project's git, never
anywhere global):

```json
{
  "mcpServers": {
    "nocetta": {
      "command": "node",
      "args": ["/path/to/nocetta/dist/mcp/server.js"]
    }
  }
}
```

`NOCETTA_ROOT` (env) and `--root` (CLI) are overrides for cross-repo tooling and
tests — never a requirement. Set one only when the working directory is not inside
the project you mean to remember.

The server registers six tools whose descriptions teach themselves, and the initialize
response carries the workflow contract (when to remember, when to recall, the worklist) —
no skill files to install; project-specific rules belong in the project's own AGENTS.md.

**For a human — the library + CLI.** Install the tarball
(`pnpm add nocetta@file:./nocetta-0.0.1.tgz`); `import { open } from "nocetta"` hosts the
whole loop, and `node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js` is
the human/CI surface — the flag is load-bearing, since an installed dist sits behind a
package-manager symlink and the entrypoint guard compares argv against the resolved
module URL.

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

The CLI's `ls` browses the store one line per node; each memory is a markdown file under
`.nocetta/memory/` — open them, hand-edit them (reads quarantine what they can't parse),
git them. `.nocetta/INDEX.md` (beside `memory/`, not inside it) is a generated one-line-
per-current-node listing, rewritten on every write — never hand-edit it, it never survives
the next mutation.

`nocetta ledger` reports the value ledger from the local recall log: which memories are
**working** (surfaced and beyond the code), **redundant** (surfaced but the code already
says it), **dormant** (never surfaced but beyond the code — latent insurance, kept), and
**prunable** (never surfaced and already in the code — the only safe-to-clear quadrant).
The log lives at `.nocetta/recall-log.jsonl` and is per-machine — nocetta keeps it out of
git via a `.nocetta/.gitignore` it maintains itself, so never commit or share it.

### Hooks (optional)

The recall log fills as an agent searches, and `used_ids` on `memory_search` lets an agent
mark which hits it used. On Claude Code you can capture that last signal automatically
instead: the `Stop` hook credits every memory whose anchored file the turn just edited —
no agent effort, no context noise (it records, it never speaks back).

**The plugin install already wires this** (`hooks/hooks.json`) — nothing to do. Only if you
run the server standalone, without the plugin, add the hook to your `settings.json` by hand:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node --preserve-symlinks-main node_modules/nocetta/dist/cli/cli.js hook stop" }] }
    ]
  }
}
```

It reads the hook payload on stdin and writes only to the local recall log; `nocetta ledger`
is where the credited memories show up.

**Push-recall (`UserPromptSubmit`).** The Stop hook above only ever records — it never
speaks back. This one does: on every user prompt it runs a keyword search over the prompt
text and, only when it finds a genuinely strong, non-repetitive match, injects that one
memory as dismissible background:

```
nocetta: a current belief that may relate to this — "<summary>" (id <id>); ignore if
off-topic, or memory_search to pull the detail.
```

It is never phrased as an instruction, and most turns it says nothing at all — silence is
the resting state. Three guardrails keep it that way:

- **An absolute relevance floor** (`NOCETTA_PUSH_FLOOR`, default `9`). BM25 scores aren't
  normalized, so "top-ranked" alone isn't evidence of relevance — a single shared common
  word always scores above zero. The default was read off sampling this project's own
  store: on-topic prompts scored top-hits of 9.6-13.3, while generic dev chatter (e.g. "can
  you fix the typo in this comment", which happens to share "fix" with an unrelated
  decision) still reached 7.5. `9` sits above every sampled false positive and below every
  sampled true positive. Raise it if your project's memories are still surfacing on
  tangential prompts; lower it (never below what your own sampling shows is safe) if
  genuinely relevant memories are being missed.
- **A cap of one.** At most one memory injects per turn, and only the single strongest
  candidate.
- **Session-scoped dedup with a rising bar, not a permanent ban.** A memory that was
  injected and later used (cited via the Stop hook, or acked) is suppressed for the rest of
  the session — it's already served its purpose. A memory that was injected and ignored can
  still re-fire later in the same session, but only once a new match's score clears the
  prior one by a real margin — a materially stronger hit, not the same weak signal firing
  again.

Two things shift the balance toward surfacing:

- **Anchor-gated matches.** When the prompt names a file a memory is anchored to, that's
  direct evidence rather than a keyword coincidence, so the match bypasses the floor. It
  still surfaces at most once per session, and a *prior anchor* suppresses a repeat — but a
  prior *keyword* injection (which may have been a false positive the agent ignored) never
  mutes a genuine anchor match, so the memory can still surface when its file actually comes
  up. Paths are read straight out of the prompt text (repo-relative or absolute), so no edit
  is needed for this to fire.
- **Compaction resets the window.** When a session's context is compacted, the "the agent
  already saw this" assumption behind the dedup expires — the injection that suppressed a
  repeat may have been summarized away. A `PreCompact` hook records the compaction, and
  push-recall stops counting injections from before it, so a still-relevant memory can
  resurface afterward.

`NOCETTA_PUSH_OFF=1` disables the hook entirely (fail-open no-op) if you'd rather run
without push-recall while keeping the citation-only Stop hook. The plugin install wires all
three hooks; standalone, add `UserPromptSubmit` and `PreCompact` the same way as `Stop`
above, pointing at `hook user-prompt-submit` and `hook pre-compact`.

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

Stack: TypeScript (strict, ESM/NodeNext), tree-sitter (native `tree-sitter` +
`tree-sitter-typescript`, symbol locator + normalized content hash), `js-yaml` for
frontmatter, `vitest` for tests. No database, no server, no LLM on the correctness path.
