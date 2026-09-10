---
id: c3cc3128-37f9-4e97-af01-dde480f878c4
summary: The recall value ledger is a surfaced×complement 2×2 (working/redundant/dormant/prunable); never-surfaced alone never means delete.
scope: global
anchors: []
edges: []
validFrom: '2026-09-10T12:04:21.397Z'
validTo: null
txnTime: '2026-09-10T12:04:21.397Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-10): the `nocetta ledger` CLI folds the local recall log over the current store into a 2×2 of (surfaced?) × (complement?): **working** (surfaced + beyond the code), **redundant** (surfaced + code already covers it), **dormant** (never surfaced + beyond the code), **prunable** (never surfaced + code already covers it).

**Why:** memory is insurance — its payoff is a counterfactual the user can't feel, so left alone only the stale-recall warts show and the premium feels unjust. The ledger is the counterweight that makes the payout visible and balances the worklist's negativity. The never-surfaced row MUST split by class: an unused complement is latent insurance (the once-in-a-blue-moon incident memory), not dead weight — so only the unused-AND-covered quadrant is ever a prune candidate. "Never recalled" alone never means delete; that is the whole insurance thesis. Framing settled with He: memory is insurance not income, and lowering the felt premium (prune dead weight) is cheaper and lands faster than proving the payout.

**How to apply:** the ledger is a report, never a gate (exit 0 always), CLI-only and deliberately off the six-tool MCP cap — management a human runs on purpose, not something the agent reaches for mid-task. Even `prunable` is a gentle candidate, never an auto-delete (a classifier false positive is exactly the noise that kills trust). Rungs ship in order: surfaced (availability) and surfaced-and-cited are rungs 1 and 2; a transcript-hook counterfactual is a later, dev-side rung. Relates to [[covered-vs-complement-residual-class]], [[ack-on-next-search-is-the-citation-signal]], [[recall-log-is-local-per-machine-telemetry]], [[the-mcp-tool-surface-is-capped-at-six-tools]] and [[noise-is-a-product-killer]].
