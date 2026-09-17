---
id: 9a89861a-4340-40a2-816f-d6910a9e890b
summary: Python (.py) and Go (.go) anchoring shipped on prebuilt-wasm grammars (2026-09-17)
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T12:04:02.750Z'
validTo: null
txnTime: '2026-09-17T12:04:02.750Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Python (`.py`) and Go (`.go`) anchoring shipped (He, 2026-09-17) on the portable web-tree-sitter wasm path, joining TS/JS and GDScript.

**Why:** He asked for the two most common host-project languages after TS/GDScript. Both tree-sitter-python and tree-sitter-go ship a prebuilt `.wasm` at package root (like tree-sitter-typescript), so they ride the existing wasm backend with no native build — a clean fit to the wasm-only invariant that [[gdscript-native-binding-exception]] had to break. allowBuilds is `false` for both in pnpm-workspace.yaml; the native addon is never loaded.

**How to apply:** `.py`/`.go` are "code" strategy in ANCHOR_STRATEGY_BY_EXTENSION; extractSymbols dispatches by extension to extractPythonSymbols / extractGoSymbols in their own modules (symbols-python.ts, symbols-go.ts), each with its own Parser.init (verified idempotent). Locator format is identical to TS. Two language-specific conventions, since neither has a `const` keyword the TS extractor relies on: Python indexes only ALL_CAPS (`/^[A-Z][A-Z0-9_]*$/`) module/class assignments as `const` (lowercase = mutable, skipped like `let`), and unwraps a decorated def to the inner definition (decorators excluded from span/hash, mirroring how TS strips `export`). Go groups methods under a `type <Receiver>` segment (methods live at top level, not in a type body), uses Go's own `type` keyword as the segment label while kind stays `class`, and iterates multi-name const specs. To add a 4th language: prefer a grammar shipping wasm, add the registry entry, write a per-language extractor mapping its node types to the shared locator segments. Relates to [[gdscript-native-binding-exception]] and the [[anchor-strategy-routing-map]].
