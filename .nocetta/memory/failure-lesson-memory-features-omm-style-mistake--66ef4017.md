---
id: 66ef4017-d5c0-411c-a4ef-4e66c3ed88c1
summary: OMM and command-anchored tool-lessons are deprioritized for nocetta — low mistake/tool-loop frequency in coding+analysis use; revisit only for immersion-breaking domains.
scope: global
anchors: []
edges: []
validFrom: '2026-09-16T21:10:35.911Z'
validTo: null
txnTime: '2026-09-16T21:10:35.911Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Failure-lesson memory features — OMM-style "mistake→guardrail" capture and command-anchored tool-use lessons (the two ideas from jarvis-code/JLC) — are deliberately deprioritized for nocetta.

**Why:** Nocetta's actual use is coding + analysis, where capable agents' mistakes and tool-loop traps are infrequent enough that a memory layer for them doesn't pay for itself. The value case is strong only in domains where a single mistake is immediately costly (e.g. RP/immersion, where an error breaks immersion at once) — not the target use here.

**How to apply:** Don't re-pitch OMM or command/error-anchored tool-lessons as backlog seams unless failure or tool-loop frequency demonstrably rises, or nocetta's use expands into immersion-breaking domains. Revisit the trigger, not the feature. Contrast with [[jarvis-vs-nocetta-positioning]]: the BM25→bge-m3 rerank recipe stays on the shelf for the deferred vector phase; the JHB/transcript-compression model stays rejected as it violates the no-LLM-in-correctness-path light.
