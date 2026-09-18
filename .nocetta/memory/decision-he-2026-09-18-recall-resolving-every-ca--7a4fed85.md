---
id: 7a4fed85-51fa-4387-9838-acde1d6abd57
summary: Recall resolves to the tip and withholds lineage from the agent by design; lineage is user-forensic via the committed store, as-of is the point-in-time escape hatch.
scope: global
anchors: []
edges: []
validFrom: '2026-09-18T11:04:07.577Z'
validTo: null
txnTime: '2026-09-18T11:04:07.577Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-18): recall resolving every candidate to its supersession tip, and the wire shape stripping all edges (supersedes/superseded-by/restates), is the right default — not a limitation to fix. Agents get a clean current belief and nothing to reason backward from; lineage is deliberately not served.

**Why:** the whole value of nocetta is that the pipeline decides currency so the agent doesn't have to. Serving the chain would reintroduce exactly the re-litigation tip-resolution exists to kill — an agent handed superseded versions plus the tip will sometimes anchor the wrong one or hedge. Clarity of reasoning comes from one answer, not a timeline. Lineage is a forensic concern that belongs to the user, and it's fully available to them because the store is plain committed markdown — git log / grep over .nocetta/ reconstructs any chain, and a user-directed agent pass can build a timeline from raw files. So nothing is lost; it's just off the served surface. Aligns with [[the-interface-speaks-tasks-the-model-speaks-structure]].

**How to apply:** keep lineage edges out of the agent-facing shape. memory_as_of is the point-in-time escape hatch (a snapshot with validity windows), NOT lineage — do not confuse the two. Before adding any lineage-aware recall (instability signal, walk-back detection off the `restates` edge), treat it as a new deliberate affordance against this decision, not a gap: the edges are recorded on disk precisely so such a feature is possible, but the default surface stays tip-only.
