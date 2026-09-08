---
id: 48f8a332-0b3a-4650-86c8-2340d4c215f0
scope: global
anchors:
  - locator: src/facade/open.ts › const MEMORY_DIR
    hash: c9cc19556b4f30f0d83ee2b8763311701c734eaafc0785a11a267118e42dece1
    artifactPath: src/facade/open.ts
edges: []
validFrom: '2026-09-08T17:20:08.290Z'
validTo: null
txnTime: '2026-09-08T17:20:08.290Z'
authority: default
overrideReason: null
version: 1
kind: claim
---

The canonical store layout is <repoRoot>/.nocetta/memory, pinned by MEMORY_DIR in the facade. Anything that reads or writes memories derives the path from here — a second hardcoded layout silently forks the store.
