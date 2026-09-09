---
id: 6b57af31-e53f-4a39-9c48-0c26efa5d3dc
summary: GDScript (.gd) anchoring is the top capability gap — a real non-TS/JS dogfood hit it, meeting the parking-lot promotion trigger for language locators.
scope: global
anchors:
  - locator: src/anchor/locate-any.ts › const ANCHOR_STRATEGY_BY_EXTENSION
    hash: 723e91255e5c10e95e9f47de4c972c15b7fa3f208dfa3480717f70957406b85c
    artifactPath: src/anchor/locate-any.ts
edges:
  - type: superseded-by
    target: d3331175-876f-4ba4-963c-827f7f64ec0e
validFrom: '2026-09-09T14:14:24.811Z'
validTo: '2026-09-09T14:32:51.239Z'
txnTime: '2026-09-09T14:14:24.811Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

GDScript (`.gd`) anchoring is nocetta's top capability gap, surfaced by the first non-TS/JS dogfood — a Godot project (He, 2026-09-09) — which is exactly the parking-lot promotion trigger for language locators.

**Why:** Seam 9's honest-refusal registry worked as designed (it correctly refused `.gd` rather than mis-parsing it as Markdown), but `ANCHOR_STRATEGY_BY_EXTENSION` lists only TS/JS + Markdown, and the "code" strategy is hardwired to a single TypeScript tree-sitter grammar in `extractSymbols`. So every code-behavior claim on the project (`income_breakdown`, `max_level_for`, `RARITIES`, `do_rebrand`) fell back to unanchored, which means no staleness detection — the core promise. On a Godot codebase nocetta is currently a tagged note store, not a self-invalidating one; the value ceiling is capped by the language mismatch, not the workflow (the onboard prompt itself performed well).

**How to apply:** promoting GDScript is a scoped slice, not a registry one-liner. It needs a tree-sitter-gdscript WASM grammar (a new runtime dependency resolved via require.resolve like the TS grammar in symbols.ts), a language-parameterized extractor (the current `extractSymbols` is TS-node-type specific — function_declaration/class_declaration/method_definition/lexical_declaration; GDScript uses function_definition/class_definition/const_statement and friends), a `.gd` → "code" entry in the registry, and a `.gd` fixture test. Two related smaller findings from the same dogfood: (1) memory_remember's tool hint never says `entity` rejects anchors — discoverable only by trial; add a clause. (2) The onboard prompt over-promises that memory_worklist surfaces "the contradictions your seeding exposed" — worklist only fires same-subject cross-authority conflicts (findConflicts groups by anchor locator, or scope for unanchored), so a doc-says-X / code-says-not-X contradiction across two different artifacts never auto-collides; reword the prompt to not claim it. Relates to [[seeding-an-already-existing-project-into-nocetta]].
