# Nocetta — spike plan

> Nocetta is an anchored, bitemporal, DAG memory system for coding agents — a memory node
> tied to a real code artifact that detects its own staleness. Sibling project to `sandkeep`.

This document is the **contract for the build**. It is settled design; implement it slice by
slice, commit each slice, run the tests each slice defines. Do not redesign — if a decision
is genuinely underspecified, pick the smallest thing that satisfies the slice's acceptance
test and note it in the commit body.

---

## The thesis (what this spike must prove)

**Anchoring kills drift.** A memory node carries an anchor to a real code artifact (a symbol),
identified by a *stable locator* plus a *content hash*. When the artifact changes, the hash
differs, the node is marked **dirty**, and dirtiness **propagates** to associated memories.
Retrieval **resolves to the live tip** of a supersession chain, so a stale fact is never served
as current. Everything is stored as **plain files** that are a *sufficient* source of truth —
live state is reconstructable from the files alone, with no database and no runtime.

If the go/no-go milestone (Slice 3) shows that editing a function reliably marks its memory
dirty and keeps it out of "current" retrieval, the thesis holds. Everything after that is
building out to competitive parity and beyond.

## Why this can rival Mem0 / Zep (the wedge)

Read from the mem0 reference (`~/projects/mem0`) at spike start:

- **Mem0 retrieves by vectors and reconciles with an LLM-judged ADD/UPDATE/DELETE**
  (`mem0/configs/prompts.py`, `DEFAULT_UPDATE_MEMORY_PROMPT`). On contradiction it **DELETEs** —
  destructive, no provenance, no history. Its V3 is "additive ADD-only with LLM-guessed
  `linked_memory_ids`" — links are *inferred by a model*, not anchored to anything verifiable.
- **Zep** is a bi-temporal knowledge graph (Graphiti). That is the real overlap — bitemporality
  and an entity graph — and we match it.
- **Neither is code-anchored.** Both are conversational-fact memories. Neither has a deterministic,
  hash-based drift signal, because neither is tied to a verifiable artifact.

Our differentiators, in priority order:

1. **Deterministic AST-anchored drift detection** — hash diff → dirty. No LLM in the correctness
   path. Mem0/Zep structurally cannot do this.
2. **Non-destructive supersession + bitemporal history** — we never DELETE on contradiction; we
   supersede (keep both, add an edge, resolve to tip). Full provenance and "as-of" queries.
3. **Files as truth — inspectable, git-diffable, portable.** Not "a vector index you can't open."
4. **Entity graph grounded in anchors** — the parity piece (vs Zep), but entities anchor to
   content artifacts and support retcon-propagation, which a conversational graph has no analog for.

Vectors are explicitly **out of scope for the spike** — deferred until a demonstrated
paraphrase-shaped miss. Keyword + structural retrieval carry the spike.

---

## Settled design decisions (carry these; do not relitigate)

- **Anchor = (stable locator, content hash).** For this spike the locator is the **AST/symbol
  path** (e.g. `path/to/file.ts › class Foo › method bar`), resolved with **tree-sitter**. The
  hash is over the *normalized* symbol body (whitespace/comment-insensitive to taste — decide in
  Slice 1 and document it). Relocation = re-parse the (possibly edited) file and find the symbol
  by its path; a line move must NOT dirty; a body edit MUST dirty.
- **Two memory categories.** (a) *Claims about code* — anchored, hash-governed, valid-time bounded.
  (b) *Decisions / values* — no code anchor, supersession-governed, transaction-time. Keep them in
  one graph with a `kind` tag; different retrieval and lifecycle, same substrate.
- **Bitemporal.** Every node carries a **valid-time** window (from the anchor: `[created, hash-changed)`)
  and a **transaction-time** (append-only write time). "Current" is a *derived view*, never the
  stored form. This is what makes revert trivial and staleness structural.
- **Supersession is an edge, not a delete.** `superseded-by` (old→new) propagates authority forward;
  `anchored-to` propagates dirtiness inward. Different traversal semantics — do not merge them.
  Dirty-propagation **stops at** superseded nodes. The supersession relation is a **DAG** (acyclic,
  fan-in allowed) — a walk-back to ~A is a *new* node with `supersedes → B` and optional
  `restates → A`, never an edge back to A.
- **Edges carry provenance & authority class** — who/what wrote it, and `invariant` vs `default`
  (a `default` may be overridden with a recorded reason; an `invariant` may not). Recency wins
  within a class; cross-class conflicts surface, they do not auto-resolve.
- **Retrieval pipeline:** candidate-gen (anchor reverse-index and/or keyword) → **resolve to tip**
  (drop superseded) → scope + valid-window filter → rank → **top-k token budget**. Matching finds;
  the graph filters; the budget caps.
- **Entity = a symbol table for prose.** A proper noun is a symbol *without a compiler*: canonical
  node + alias set; references resolved by name/alias (exact) or inferred (tagged lower-confidence).
  `rename-entity` ≈ rename-symbol; retcon ≈ dirty-propagation across content anchors.

## Cross-cutting invariants — build in from line one, do NOT retrofit

- **Files-sufficient.** From Slice 2 the on-disk files (frontmatter + body) are the complete source
  of truth. Any index is a *rebuildable fold*. A test must reconstruct full live state from files
  alone.
- **Single write choke-point.** All memory writes go through one function from Slice 2, so the
  never-leak gate (Slice 7) slots in without touching call sites.
- **Never-leak.** The write path must refuse to persist obvious secrets (credential basenames,
  `.env`/ssh-key/`.netrc`/`.pgpass`/`.git-credentials` contents, high-entropy token shapes).
  Inherited from sandkeep's posture. Landed in Slice 7 but the choke-point exists from Slice 2.
- **No LLM in the correctness path.** LLM calls are allowed only for *candidate/suggestion*
  generation (entity linking, contradiction *flagging*), never as the arbiter of what is current.

---

## Slice decomposition (each slice = one commit, with tests green)

**Slice 0 — Scaffold.** TS + ESM, `vitest`, `tsconfig` strict, `tree-sitter` (native
`tree-sitter` + `tree-sitter-typescript`; fall back to `web-tree-sitter` wasm if native build
fails — document which). `README.md` (thesis + wedge, short). The memory file-format spec written
down. `pnpm test` runs and passes an empty suite.
_Commit: `chore: scaffold nocetta spike (ts + tree-sitter + vitest)`_

**Slice 1 — Anchor identity & relocation (THE CRUX).** Parse a TS file with tree-sitter; enumerate
symbols (functions, classes, methods, exported consts) with a stable symbol path; compute a
normalized content hash per symbol. Implement `locate(anchor, sourceAfter)` → relocates the symbol
and reports `{found, hashChanged}`. Tests: (a) inserting lines above a symbol does not change its
hash; (b) editing the symbol body changes the hash; (c) renaming the symbol is reported as
not-found (candidate for a fuzzy fallback later, but for now: honest miss); (d) moving a method
between classes updates its path.
_Commit: `feat(anchor): tree-sitter symbol locator + normalized content hash`_

**Slice 2 — File store (files-as-truth).** One markdown file per memory: YAML frontmatter
(`id`, `kind`, `scope`, `anchors[]` = {locator, hash, artifactPath}, `edges[]`, `validFrom`,
`validTo`, `txnTime`, `authority`) + body. `write(node)` (the single choke-point), `readAll()`,
and a rebuildable **reverse index** artifact→memories built as a fold over the files. Test:
reconstruct the full graph + reverse index from files alone.
_Commit: `feat(store): file-backed memory nodes + rebuildable reverse index`_

**Slice 3 — Dirty detection + thesis eval (GO/NO-GO).** A `check(repoState)` pass recomputes
each anchor's hash via Slice 1 and flags dirty nodes; dirtiness propagates along `anchored-to`
(stopping at superseded nodes). **Adversarial replay harness**: fixture repo → create a memory
anchored to a function → mutate the function → assert the node goes dirty → assert it is excluded
from "current" retrieval → assert a line-move does NOT dirty it. This is the thesis. If it passes,
the spike is validated.
_Commit: `feat(drift): dirty detection + adversarial replay eval (thesis proven)`_

**Slice 4 — Anchor-driven retrieval + pipeline.** Given "files in play", surface live non-dirty
memories via the reverse index; implement the full pipeline (candidate → resolve-tip → scope +
valid-window → rank → top-k budget). `search_memory` as an explicit callable + an auto
"context-triggered" surface given a file set. Tests for each pipeline stage.
_Commit: `feat(recall): anchor-driven retrieval pipeline with top-k budget`_

**Slice 5 — Supersession + bitemporal.** `supersede(old, new, {restates?})`; resolve-to-tip;
valid-time + txn-time stamping; `asOf(txnTime)` query; acyclicity guard + fan-in; dirty-propagation
stops at superseded. Tests: walk-back (A→B→A'' restates A resolves to A''); as-of returns the
belief held at T; cross-authority conflict surfaces rather than auto-resolving; retcon dirtying.
Split into 5a (supersession + resolve) and 5b (bitemporal stamps + asOf) if it gets large.
_Commits: `feat(super): non-destructive supersession + resolve-to-tip`,
`feat(time): bitemporal stamps + as-of query`_

**Slice 6 — Keyword retrieval + value category.** BM25 (or trigram) over bodies as a second
candidate-gen feeding the same pipeline; the *decisions/values* node kind (no anchor,
supersession-governed); authority classes (`invariant`/`default`) with override-with-reason.
Tests: keyword recall on identifiers; a value node superseded and resolved; an override recorded.
_Commit: `feat(recall): keyword candidate-gen + value/decision category`_

**Slice 7 — Never-leak gate + portability proof.** Implement the write-path secret refusal at the
Slice-2 choke-point. A portability test: `tar` the files, wipe every index/derived artifact,
reconstruct full live "current" state from files alone, assert identical to pre-wipe.
_Commit: `feat(safety): never-leak write gate + files-sufficient portability proof`_

**Slice 8 — Lore entity graph (far goal).** Entity nodes (canonical + alias set); a `kind: "entity"`
and `kind: "lore-fact"`; anchor generalized so a lore-fact anchors to a **content artifact** (a
prose/markdown/JSON file span), reusing the Slice-1 locator idea for non-code files (line/heading
span + hash — a second locator strategy). Ops: `findReferences(entity)`, `goToDefinition(entity)`,
`renameEntity(old,new)`. **Retcon demo**: supersede a lore-fact → every content artifact anchored
to it goes dirty (the continuity worklist) — this is the headline demo. Consistency check on write:
retrieve the entity's live fact-set, flag contradictions (LLM *suggestion* only, not arbiter).
Entity linking starts exact-name + alias; note where embeddings would extend it. Split into
8a (entity nodes + content-artifact anchor + find-refs/rename), 8b (retcon-propagation demo),
8c (write-path consistency flagging).
_Commits: `feat(lore): entity symbol-table + content-artifact anchors`,
`feat(lore): retcon dirty-propagation continuity worklist`,
`feat(lore): write-path contradiction flagging`_

---

## Execution protocol

- Work top-down, one slice at a time. Each slice: implement → tests green → `git commit` with the
  message above (extend with a body noting any decisions taken). Never batch slices into one commit.
- Keep the diff minimal and idiomatic. Prefer the standard library and already-added deps; do not
  add a dependency for what a few lines cover. tree-sitter and a YAML parser are the only expected
  heavyweight deps; a BM25 can be hand-rolled or a tiny lib — justify in the commit if you add one.
- If tests for a slice cannot be made green, stop and leave a `BLOCKED:` note at the top of this
  file describing exactly what failed and why; commit what compiles on a branch, do not force.
- If you hit a usage limit mid-slice, resume from the last green commit when it resets.
- LLM-dependent bits (Slice 8 linking/flagging) may be stubbed behind an interface with a
  deterministic fake in tests, so the suite never depends on a live model.
