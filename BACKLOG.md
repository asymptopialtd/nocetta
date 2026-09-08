# Nocetta — post-spike backlog

> The spike (PLAN.md, Slices 0–8) proved the thesis: anchored memories detect their own
> staleness and retrieval never serves a stale fact as current. This document is the
> contract for the next phase: turning the engine into something an agent can drop into
> a real project and use intuitively. Same protocol as PLAN.md — work top-down, one seam
> per commit, tests green before commit, do not redesign. If a decision is underspecified,
> pick the smallest thing that satisfies the seam's acceptance test and note it in the
> commit body.

---

## Guiding lights

Invariants that outrank any feature. When a seam decision conflicts with a light, the
light wins and the seam shrinks. Each light names where it is enforced.

1. **No LLM in the correctness path.** Models generate candidates and suggestions;
   deterministic hash/anchor/DAG logic decides what is current. A tool result a model
   could have corrupted is a bug. — *Enforced by: architecture; every MCP tool's output
   is a pure function of files + repo state.*

2. **Files are truth; everything else is a rebuildable fold.** Any index, cache, or
   in-memory graph may be deleted at any moment; nothing user-visible depends on it
   surviving. — *Enforced by: the portability test, re-asserted at facade level (Seam 2).*

3. **One write choke-point.** Every mutation — remember, supersede, override, re-anchor,
   retire — routes through `writeNode`, so gates (never-leak, validation) apply everywhere
   forever. — *Enforced by: review convention; no other module imports fs write primitives.*

4. **Anchors are the product.** A feature that doesn't make anchored facts more
   trustworthy or the anchored loop faster is scope creep, however reasonable it sounds.
   Deferral is the default; the parking lot at the bottom of this file holds deferred
   features together with the condition that would promote them.

5. **Honest failure over silent guessing.** A renamed symbol is `not-found`, not fuzzy
   luck; a `remember` that can't resolve an anchor refuses with candidates instead of
   writing an unanchored guess; an unknown file extension is a hard error, not a
   wrong-strategy parse. — *Enforced by: tests asserting the refusal paths.*

6. **The agent loop is the unit of ergonomics.** The loop is capture → recall → drift →
   repair. APIs are judged by how few unstated assumptions the loop needs — never by
   function count or coverage. If a step requires hand-assembled frontmatter or a
   paragraph of explanation, the API is wrong. — *Enforced by: the dogfood-eval rubric
   (Seam 6).*

7. **Token discipline — the interface speaks tasks, the model speaks structure.** Outputs
   are shaped for a context window: ranked, compact, self-describing, never a graph dump.
   Surface what informs the agent's own choices (kind, authority, anchor locators, ids,
   staleness reasons); hide what the engine has already decided (validity windows on
   current results, hashes, edge machinery). A field in a result is an invitation to
   reason about it — and re-litigating currency is exactly the judgment nocetta exists to
   make for the agent. — *Enforced by: the shape tests (search carries no validity
   window, as-of does; never a hash).*

8. **Artifacts carry weight.** Comments state constraints the code cannot show; tests
   assert invariants and are named after the property they protect; docs record decisions
   and rationale, never narrate mechanics. A comment that restates the next line is noise
   to delete. — *Enforced by: review convention.*

9. **The bar is external, not internal.** Done means a dogfooding agent completes the
   loop and its feedback is good — observed in real use of nocetta building itself, not
   felt in review. Shipping every seam in this file is explicitly not the bar. —
   *Enforced by: dogfooding (Seam 6), the acceptance layer for everything else.*

---

## The seams

Dependency order: 1 → 2 → 3 → 4 → 5 → 6, with 7–10 following dogfood demand. Seams 1–5
are the drop-in core; 6 is the gate that says whether they're good enough.

### Seam 1 — Node factory + `remember` (capture)

The retrieval half exists; the capture half doesn't. Writing a memory still requires
hand-constructing a `MemoryNode` — including a locator string in exact tree-sitter format
and a hash of the normalized AST body, which no agent can produce. Capture is where
intuitive is won or lost.

```ts
createNode(partial: Partial<MemoryNode> & { kind: NodeKind; body: string }): MemoryNode;
// fills id (uuid), validFrom/txnTime (now), authority "default", overrideReason null,
// anchors [], edges [], and version: 1 (frontmatter format version — one line now,
// a migration later).

remember(nodes, req: {
  body: string;
  kind: NodeKind;
  artifactPath?: string;
  symbolName?: string;   // code anchor: exact symbol-name match via extractSymbols
  heading?: string;      // content anchor: exact heading match via extractContentSpans
  scope?: string;
  authority?: Authority;
  supersedes?: string;   // capture-as-supersession in one call
}): { node: MemoryNode; warnings: string[] };
```

Anchor resolution: extract symbols/spans for `artifactPath`, filter by exact name.
Zero matches → refuse with the nearest candidates (light 5). More than one → refuse
listing candidate locators for the agent to pick. Exactly one → anchor with the
extractor's own locator + hash. Contradiction advisory (`checkConsistency` /
`findConflicts`) returns as `warnings`, never gates (light 1). Never-leak keeps gating
via `writeNode` — the choke-point is untouched (light 3).

**Acceptance:** remember → edit the symbol body → node goes dirty (fixture round trip);
refusals for no-match, ambiguous-match, and secret body; `supersedes` resolves to tip;
`version` round-trips. **Commit:** `feat(capture): createNode + remember — anchored
capture with honest refusals`

### Seam 2 — `open()` facade + repo-state loader

Every API is currently `(nodes[], repoState, ...)` pure functions; a host must wire
everything itself, and a forgotten file in `RepoState` silently dirties every memory
anchored to it. The facade removes both error classes.

```ts
open(repoRoot: string, opts?: { locator?: SymbolLocator }): Nocetta;

interface Nocetta {
  search(q: SearchQuery): SearchResult[];
  contextTrigger(files: string[], opts?): SearchResult[];
  remember(req): { node; warnings };
  supersede(oldId, next, opts?): { old; next };
  override(oldId, next, reason, opts?): { old; next };
  worklist(): Worklist;            // Seam 4
  reAnchor(id, req): MemoryNode;   // Seam 4
  retire(id, reason): MemoryNode;  // Seam 4
  asOf(at: string): MemoryNode[];
  issues(): StoreIssue[];          // Seam 3 quarantine report
}

loadRepoState(root: string, nodes: MemoryNode[]): RepoState;
// reads exactly the anchored artifactPath set — nothing more, nothing forgotten.
```

The facade owns `readAll` → validation → index building, with explicit reload (no file
watchers yet). **Acceptance:** the portability test re-asserted through `open` (wipe all
derived state → reconstruct → identical); the loader touches only anchored paths.
**Commit:** `feat(facade): open() + loadRepoState — one object hosts the whole loop`

### Seam 3 — Read validation, quarantine, atomic writes

Files-as-truth means humans will hand-edit `.nocetta/` files, so reads must survive bad
files and writes must survive crashes.

- `parseNode` validates required fields, enums (`kind`/`authority`/edge types), ISO
  dates, edge shape. A malformed file is quarantined with a readable `StoreIssue` and
  the read continues — never a thrown exception taking every query down.
- `writeNode` writes tmp + atomic rename (concurrent agent sessions are the norm, not
  exotic; git is the merge layer, atomicity is ours).
- Artifact paths normalized to posix separators.

**Acceptance:** a hand-corrupted file quarantines with a reason while the rest of the
store reads; a truncated mid-write file never yields a half node; every fixture
round-trips identity through serialize/parse. **Commit:**
`feat(store): validated reads with quarantine + atomic writes`

### Seam 4 — Drift repair: worklist, re-anchor, retire

`check()` returns a transient dirty set and the workflow dead-ends. The everyday loop
needs a repair path; today fixing a dirty node means hand-editing frontmatter.

```ts
worklist(): { dirty: { node; reason }[]; conflicts: Conflict[]; issues: StoreIssue[] };

reAnchor(id: string, req: { symbolName?: string; heading?: string }): MemoryNode;
// identity repair, in place: locator + hash updated; valid-time window untouched —
// the belief didn't change, and git carries the repair history (settled decision).

retire(id: string, reason: string): MemoryNode;
// closes validTo = now + records retiredReason. One schema addition:
// optional retiredReason: string | null. No tombstone nodes.
```

Retired nodes drop out of "current" via the existing valid-window filter and stay
visible to `asOf`. **Acceptance:** drift → worklist shows reasons verbatim → reAnchor →
node live again with no new node; retire → excluded from current, present in asOf.
**Commit:** `feat(repair): worklist + reAnchor + retire — the drift loop closes`

### Seam 5 — MCP server (the drop-in surface)

No `bin`, no MCP entry — nothing to install. The MCP server is the canonical drop-in,
and tool descriptions are the intuitive UX: each must be self-sufficient with one
example. Six tools, and six is the cap — new capability folds into an existing tool
before a seventh is even discussed:

- `memory_search {files_in_play?, keyword?, scope?, max_results?}`
- `memory_remember {body, kind, artifact_path?, symbol?|heading?, scope?, authority?, supersedes?}`
- `memory_supersede {old_id, body, restates?}`
- `memory_worklist {}` — dirty + conflicts + issues, one "what needs attention" surface
- `memory_repair {node_id, action: reanchor|retire, symbol?|heading?, reason?}`
- `memory_as_of {at}`

Results shaped per light 7: id, anchor, authority, validity, staleness reason — ranked,
budgeted, never a dump.

Packaging posture (settled 2026-09-08, He): **closed source.** Stay `private: true`,
`license: "UNLICENSED"`; distribute to trusted projects by tarball (`pnpm pack` →
`file:` install) or a private registry. A public npm listing would expose the source
even under UNLICENSED — registry visibility is not licensing. Opening up is a one-way
door; revisit only after real adoption.

**Acceptance:** a spawn-and-drive integration test exercises capture → recall → drift →
repair through tool calls only, against a fixture repo. **Commit:**
`feat(mcp): stdio server — six tools, self-sufficient descriptions`

### Seam 6 — Dogfood (the bar)

Settled 2026-09-08 (He): **no synthetic fixture benchmark.** A hand-built harness
overfits to a benchmark that was never real. The standing acceptance layer is
dogfooding: nocetta memorizes its own development — every guiding light, decision, and
landmark is captured in `.nocetta/` as it settles, and every seam is exercised in real
use as it lands (capture via `remember`, recall before edits, drift after real
refactors, repair via the worklist). The end-of-phase review records friction honestly:
task completed? unstated assumptions? tokens burned? wrong-tool or re-read loops?

A scripted eval may only be added later, and only by replaying recorded real sessions
(see parking lot). A seam isn't done until its scenario passed in real use.

### Seam 7 — Skill kit + quickstart

The skill kit — `skills/nocetta/SKILL.md` (the workflow contract: when to remember, when
to recall with files-in-play, the worklist loop, capture rules) plus `skills/nocetta/AGENTS.md`
(the paste-in snippet) — landed in review round 1, alongside the README "Getting started"
quickstart. Review round 3 settled it: skills are probabilistic delivery — agents do not
consistently load them (He's experience, echoed by evidence) — so the contract moved into
the server's `instructions` (the initialize response), with tool descriptions and outputs
as the always-present layers. The skill kit is retired; project-specific rules belong in
the adopting project's own AGENTS.md.

### Seam 8 — CLI + CI gate

`nocetta check [--strict]` exits nonzero on dirty memories or unresolved conflicts (the
CI gate that makes drift actionable at PR time), plus `nocetta worklist` and `nocetta
ls`. GitHub Actions snippet in the README. **Commit:**
`feat(cli): check/worklist/ls — drift as a CI gate`

### Seam 9 — Language registry (honest errors first)

`locate-any.ts` currently routes every non-`.ts/.tsx` file to the *Markdown heading*
locator — anchoring a Python symbol parses `# comments` as headings and fails
nonsense. Replace with an ext→locator registry; unknown extension is a hard, honest
error (light 5). Alias `.js/.jsx/.mjs` to the shipped TS grammars.

**Acceptance:** anchoring a `.py` file refuses with "no locator strategy for .py";
`.js` anchors and relocates. **Commit:**
`fix(anchor): ext registry — unknown extensions refuse honestly, JS rides the TS grammars`

### Seam 10 — Performance caches (only when measured)

mtime-keyed symbol cache in the facade, BM25 doc-stats cache, loaded-store cache —
only if a Seam-6 run demonstrates the pain (light 4). Caches are folds (light 2),
never truth. No commit until measured.

---

## Parking lot (explicitly deferred, with promotion conditions)

- **Embeddings / semantic recall** — promote on a demonstrated paraphrase-shaped miss in
  real dogfood use (per PLAN.md; do not relitigate early).
- **Scripted eval harness** — promote only as a replay of recorded real dogfood
  sessions; never a hand-built fixture benchmark (overfit risk, settled 2026-09-08).
- **Python/Go/Rust locators** — promote on the first real non-TS/JS dogfood project.
- **Monorepo scope conventions** — promote the first time exact-or-global scope matching
  loses a memory it should have found.
- **Daemon/watch mode, multi-store federation, merge UI** — no current demand; don't
  build ahead of the loop.
- **Migration tooling** — the `version` field (Seam 1) is the whole investment until a
  real store breaks.
- **Windows verification** — path normalization is preventive, untested; promote to
  actually tested just before external closed alpha (He, 2026-09-08).
- **Retrofit/onboarding scaffold (`nocetta init`, doc importers)** — deferred on
  principle (He, 2026-09-09): nocetta is best at building memories ground-up, where
  every capture has real consult demand behind it; retroactive bulk import produces
  unanchored prose with no drift pressure. A fresh repo needs no init — discovery
  creates the store on first remember, and the server instructions carry the loop.
  Promote only if a real retrofit dogfood shows an agent flailing for a starting
  scaffold; the workflow until then is the onboarding pass in chat (rules first,
  hot-path claims second, stop).
- **Commercial artifact hardening** — when distribution extends beyond trusted
  machines: bundle + minify (esbuild), license terms/keying; a native core (napi/SEA)
  only if opacity ever becomes existential. The design itself is already public —
  the moat is the store, the workflow, and the iteration speed.
