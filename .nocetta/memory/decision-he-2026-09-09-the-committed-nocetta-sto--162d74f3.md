---
id: 162d74f3-eb7e-4150-a514-8d5caf13f5fe
scope: global
anchors: []
edges: []
validFrom: '2026-09-09T08:17:56.204Z'
validTo: null
txnTime: '2026-09-09T08:17:56.204Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-09): the committed .nocetta/ store gets an auto-generated human index (e.g. .nocetta/INDEX.md, one line per current node from its summary), regenerated on write.

**Why:** nocetta's thesis is that live recall replaces a hand-kept index for AGENTS, but the store is committed to git and therefore read by HUMANS too — and a folder of machine-frontmatter nodes is unreadable without the MCP server running. The old ~/.claude memory system kept a hand-written MEMORY.md (one line + hook per memory); nocetta should keep that human affordance but generate it so it never goes stale. nocetta optimized the write for the anchor engine and forgot the human reader the committed store implies.

**How to apply:** render one line per current (non-superseded, non-retired) node from its summary field on each write; never hand-maintain it. Depends on the summary field from [[node-write-format-summary-and-shape]].
