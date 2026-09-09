---
id: 5d24cc83-f0db-45c5-a011-ad9ead1f32d8
scope: global
anchors: []
edges: []
validFrom: '2026-09-09T08:17:41.055Z'
validTo: null
txnTime: '2026-09-09T08:17:41.055Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-09): memory_remember's tool result carries a post-write staging hint — it names the file just written under .nocetta/ and notes it is uncommitted, so the agent can stage it alongside the related change. A hint the agent acts on, NOT a hook that auto-stages.

**Why:** external dogfooding showed agents don't stage new memory files with their changelist, so the human commits them by hand every session — friction that kills the write habit. The tool RESULT is the highest-leverage agent-facing channel (always-on, contextual), so the nudge belongs there, not in a git hook that would take the decision away from the agent.

**How to apply:** emit the relative path of the written node in the memory_remember result plus a one-line "uncommitted — stage it with the change it documents if it belongs there". Never auto-run git add. Relates to [[node-write-format-summary-and-shape]].
