---
id: 2285e74d-2046-47ba-8232-0985876d40b6
scope: global
anchors:
  - locator: src/anchor/locate-any.ts › const ANCHOR_STRATEGY_BY_EXTENSION
    hash: 723e91255e5c10e95e9f47de4c972c15b7fa3f208dfa3480717f70957406b85c
    artifactPath: src/anchor/locate-any.ts
edges: []
validFrom: '2026-09-08T18:46:41.386Z'
validTo: null
txnTime: '2026-09-08T18:46:41.386Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

ANCHOR_STRATEGY_BY_EXTENSION in src/anchor/locate-any.ts is the one routing map for anchor strategies — capture, repair, and drift all consume it, so it must never be forked. Unlisted extensions refuse honestly; JS deliberately rides the TS grammar.
