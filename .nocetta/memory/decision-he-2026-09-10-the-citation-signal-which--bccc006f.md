---
id: bccc006f-e622-4833-8771-29067158687a
summary: Citation (rung 2) rides used_ids folded into memory_search (ack-on-next-search), never a 7th tool.
scope: global
anchors: []
edges: []
validFrom: '2026-09-10T12:04:34.026Z'
validTo: null
txnTime: '2026-09-10T12:04:34.026Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-10): the citation signal — which recalled memories the agent actually used — is captured by an optional `used_ids` on `memory_search` (the next search names the prior-result ids it used), not by a new tool.

**Why:** citation is only knowable AFTER the agent has answered, a moment when it is calling no tool. A dedicated `memory_cite` tool would be a new latent trigger with no natural anchor, and nocetta's own dogfood showed agents under-call category/judgment-triggered actions — so it would be under-called exactly like capture was, and it would breach the six-tool cap for a worse signal. Folding onto the next search attaches the signal to an event that already fires; He confirmed he'd choose it even with the cap lifted. Loosening the cap does NOT give a better option here — the better capability is a different class, not another tool.

**How to apply:** `used_ids` is recorded to the local recall log as an `ack` event and never changes what the search returns; a trailing ack-only call (used_ids with no query) is honoured so the last recall of a task can still be acknowledged. The strictly-better future upgrade is out-of-band, not a tool: a Claude Code Stop hook that reads the agent's real output and auto-detects referenced ids (zero agent burden, closes ack's last-recall gap) — additive over ack, harness-specific so never the sole mechanism. Relates to [[the-recall-value-ledger-2x2]], [[the-mcp-tool-surface-is-capped-at-six-tools]] and [[seeding-an-already-existing-project-into-nocetta]] (prompt-not-tool is the same off-the-cap move).
