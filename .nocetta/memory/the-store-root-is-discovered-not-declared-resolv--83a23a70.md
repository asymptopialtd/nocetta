---
id: 83a23a70-07ef-4a8d-94d3-a57c12f73636
scope: global
anchors:
  - locator: src/facade/root.ts › function resolveRoot
    hash: d991638214285656b31fb1c990a8ffe2d23288798950305297c6d24fd4682a30
    artifactPath: src/facade/root.ts
edges: []
validFrom: '2026-09-08T21:19:42.853Z'
validTo: null
txnTime: '2026-09-08T21:19:42.853Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

The store root is discovered, not declared: resolveRoot walks up from the working directory to the nearest ancestor holding .nocetta/ (existing store) then .git/ (project boundary), falling back to cwd. NOCETTA_ROOT and --root are overrides for cross-repo tooling and tests, never a requirement — one globally-registered MCP server must serve every project without per-project env config. Nearest level wins: a subproject store is not swallowed by an outer repo.
