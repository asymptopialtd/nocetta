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

## Memory file format

One markdown file per memory node, YAML frontmatter + body, under
`.nocetta/memory/<slug>--<id8>.md` (a kebab slug of the body plus the id's first 8
chars — readable in `ls` and `git log`; identity is always the frontmatter `id`):

```yaml
---
id: string                  # stable node id (uuid-like, content-independent)
kind: claim | value | entity | lore-fact
scope: string                # e.g. a repo-relative directory, or "global"
anchors:                     # zero or more; claims/lore-facts are typically anchored
  - locator: string          # "path/to/file.ts › class Foo › method bar" (code)
                              # or "path/to/doc.md#Heading" (content-artifact span, Slice 8)
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
