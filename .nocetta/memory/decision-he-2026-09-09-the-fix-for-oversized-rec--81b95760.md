---
id: 81b95760-96f1-449e-a51a-682b23e14d6c
scope: global
anchors: []
edges: []
validFrom: '2026-09-09T08:17:50.024Z'
validTo: null
txnTime: '2026-09-09T08:17:50.024Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-09): the fix for oversized recall is concise STRUCTURED writing, not truncation. Truncation (excerpt + marker) is only a safety floor for pathological legacy imports — nocetta's own capture produces ~1-3KB nodes, so chronic bloat is not the native problem. Two real gaps: nodes have no skimmable structure (run-on prose) and no summary field, so recall can only rank on and return whole bodies, letting one fat node crowd out ten precise ones.

**Why:** the 50KB node in the dogfood feedback was a legacy session-log import, not a native node. The durable fix is a one-line summary per node so recall previews on summaries and expands bodies only within budget — this closes both the crowding problem and the human-readability complaint at once. A soft length nudge in the memory_remember result (body well past the median → suggest a lead + **Why:**/**How:** shape, or supersede the sprawling node) beats a hard cap. This is our own principle applied: noise/bloat is a product killer, structure beats a cap.

**How to apply:** (1) add a required one-line summary/description field to the node + frontmatter; (2) recall returns summary-first, bodies within maxBodyChars; (3) capture path encourages the lead + **Why:**/**How:** body shape and [[wikilinks]] between nodes — the shape the old ~/.claude memory system used and nocetta dropped; (4) keep excerpt-with-marker truncation as the last-resort floor only. Relates to [[human-readable-committed-store-index]] and [[post-write-staging-hint]].
