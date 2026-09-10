---
id: 91be1210-472f-43cb-bbf0-efd0450f2cc0
summary: classify() labels a memory covered vs complement by token-novelty of its body against the anchored code; covered is rare by design.
scope: global
anchors:
  - locator: src/recall/residual.ts › function classify
    hash: b352a248cc265a3bdc1f05e9b004033305fabd8d3a2ea55ff60983d49bb966b2
    artifactPath: src/recall/residual.ts
edges: []
validFrom: '2026-09-10T12:04:58.782Z'
validTo: null
txnTime: '2026-09-10T12:04:58.782Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

`classify` in src/recall/residual.ts scores a memory as `covered` (the anchored code already says it) or `complement` (it carries knowledge the code cannot). Only a code-anchored claim can be `covered`; every value/entity/lore-fact and every doc-anchored fact is a `complement` (no code span to be covered by).

**Why:** the human-facing pair is "already in the code" vs "beyond the code" (He tuned the words to covered/complement, 2026-09-10). The signal is token-novelty: the fraction of the body's significant tokens (tokens.ts stopwords stripped) absent from the anchored symbol's source span; at/above NOVELTY_FOR_COMPLEMENT (0.5) the body is a complement. The threshold is tuned HIGH on purpose — nocetta's own capture shape (lead + Why/How rationale) makes genuine complements the common case, so `covered` should fire rarely, only for prose that barely exceeds the symbol it restates. Dogfood confirms it: all 21 of nocetta's own current memories classify as complement. This is why the classifier is the keystone — it gates what is worth insuring, and it is the axis that makes `prunable` safe (never-surfaced AND covered).

**How to apply:** it is a tunable heuristic, not a proof; a misclassification costs a mislabel in a report, never a lost belief. The classifier reads artifact source via an injected readArtifact (repo fs in the CLI, stubbed in tests) and defaults to nocetta's built-in locator. Relates to [[the-recall-value-ledger-2x2]] and [[noise-is-a-product-killer]].
