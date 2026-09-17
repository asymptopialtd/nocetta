---
id: d3331175-876f-4ba4-963c-827f7f64ec0e
summary: GDScript (`.gd`) anchoring shipped (He, 2026-09-09) via the node-tree-sitter native binding — a deliberate exception to…
scope: global
anchors:
  - locator: src/anchor/locate-any.ts › const ANCHOR_STRATEGY_BY_EXTENSION
    hash: 6a0257c85e13c58d2324d856e043ee33a3914b4cd0edc8616bddaa6407a73d0c
    artifactPath: src/anchor/locate-any.ts
edges:
  - type: supersedes
    target: 6b57af31-e53f-4a39-9c48-0c26efa5d3dc
validFrom: '2026-09-09T14:32:51.239Z'
validTo: null
txnTime: '2026-09-09T14:32:51.239Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

GDScript (`.gd`) anchoring shipped (He, 2026-09-09) via the node-tree-sitter native binding — a deliberate exception to nocetta's wasm-only grammar rule.

**Why:** the only maintained tree-sitter GDScript grammar (tree-sitter-gdscript) ships a native `.node` addon, not a wasm, and there was no prebuilt wasm and no local toolchain (emcc/docker) to build one. He chose the native binding over building or vendoring a wasm, accepting that `.gd` anchoring is unavailable on browser/edge and needs per-platform prebuilds. TS/JS stay on the wasm path; only `.gd` uses the native parser (src/anchor/symbols-gdscript.ts).

**How to apply:** `.gd` is now a "code" strategy in ANCHOR_STRATEGY_BY_EXTENSION; extractSymbols dispatches `.gd` to extractGdscriptSymbols (top-level func/const/class_name plus inner-class methods/consts, identical locator format to TS). tree-sitter and tree-sitter-gdscript are allow-listed to build in pnpm-workspace.yaml (node-gyp-build uses the shipped prebuild, compiles only if none matches). The two related dogfood fixes also landed: memory_remember's hint now states value/entity are unanchored, and the onboard prompt no longer claims memory_worklist surfaces doc-vs-code contradictions. If a wasm GDScript grammar ever becomes available, revisit to restore the portability invariant. Relates to [[seeding-an-already-existing-project-into-nocetta]].
