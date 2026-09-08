---
id: 7e265cdb-e39e-4fc3-8a0c-1484f9c60189
kind: claim
scope: global
anchors:
  - locator: src/store/store.ts › function writeNode
    hash: fb1c34615ec9bc2bd8d6abd2e9ef4291e3fe2672564f26e222bcd56dcbecd664
    artifactPath: src/store/store.ts
edges: []
validFrom: '2026-09-08T17:30:00.000Z'
validTo: null
txnTime: '2026-09-08T17:30:00.000Z'
authority: invariant
overrideReason: null
---

Every memory write routes through writeNode (src/store/store.ts) — the single write
choke-point, so cross-cutting gates (never-leak, later validation) apply everywhere
without touching call sites. Guiding light 3, BACKLOG.md.
