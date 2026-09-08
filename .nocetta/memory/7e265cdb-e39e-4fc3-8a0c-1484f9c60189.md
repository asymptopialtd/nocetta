---
id: 7e265cdb-e39e-4fc3-8a0c-1484f9c60189
kind: claim
scope: global
anchors:
  - locator: "src/store/store.ts › function writeNode"
    hash: 7d1171bdce7f4473b82f5e8a6dfe0d035106a2856eed3f049d43966a9b8a99c8
    artifactPath: src/store/store.ts
edges: []
validFrom: 2026-09-08T17:30:00.000Z
validTo: null
txnTime: 2026-09-08T17:30:00.000Z
authority: invariant
overrideReason: null
---

Every memory write routes through writeNode (src/store/store.ts) — the single write
choke-point, so cross-cutting gates (never-leak, later validation) apply everywhere
without touching call sites. Guiding light 3, BACKLOG.md.
