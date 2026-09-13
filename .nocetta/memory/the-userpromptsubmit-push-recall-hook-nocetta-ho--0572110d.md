---
id: 0572110d-7289-47ba-9975-8353903b547a
summary: 'The UserPromptSubmit push-recall hook (`nocetta hook user-prompt-submit`) is built: `src/recall/push-recall.ts` holds t…'
scope: global
anchors: []
edges: []
validFrom: '2026-09-13T21:44:22.263Z'
validTo: null
txnTime: '2026-09-13T21:44:22.263Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

The UserPromptSubmit push-recall hook (`nocetta hook user-prompt-submit`) is built: `src/recall/push-recall.ts` holds the pure `selectPushRecall` guardrail (floor, cap-at-1, anchor-bypass, session dedup with a rising bar), and `src/recall/user-prompt-submit-hook.ts` is the I/O shell (env knobs, the recall log, the injected message).

**Why:** governed by [[per-turn-push-recall-must-be-cooperative-never-nagging-or-forcing]] and mapped by [[the-claude-code-hook-lifecycle-mapped-to-nocetta]] (item 4, "hold until precision is proven"). Two implementation choices worth recording because they don't survive in the diff:

1. `NOCETTA_PUSH_FLOOR` defaults to **9** — calibrated by sampling this project's own store with `rankedSearch` against ~10 prompts (4 genuinely on-topic, 6 generic dev chatter). On-topic top-hits scored 9.6-13.3; the worst false positive ("can you fix the typo in this comment", sharing "fix" with an unrelated decision body) scored 7.5. 9 sits above every sampled false positive and below every sampled true positive — BM25 here has no normalization, so this is a project-specific empirical read, not a formula, and should be recalibrated if it starts misfiring.
2. `RISING_BAR_MARGIN` is **4** (a constant additive score margin, not a percentage) — an ignored injection re-fires only once a later candidate's score clears the prior one by more than 4, which the sampled score spread (roughly 2-13) suggests is a materially different match rather than query-to-query jitter on the same weak overlap.

**How to apply:** `rankedSearch` (new export in `src/retrieval/search.ts`, refactored out of `searchMemory` so it stops short of `applyBudget` and still carries `matchedFiles` per candidate) is what feeds `selectPushRecall` — reuse it rather than re-deriving anchor/keyword shape from `SearchResult`, which strips `matchedFiles`. `RecallEvent` (`src/recall/log.ts`) gained an `inject` kind plus optional `session`/`score` fields, guarded so old log lines without them still parse. Anchor-sourced candidates (`matchedFiles.size > 0`) bypass both the floor and the session dedup entirely — they're direct evidence, not a BM25 score. The CLI wiring never populates `filesInPlay` (extracting file paths from the prompt text was left as a documented nice-to-have, not built), so in practice today every candidate reaching the hook is keyword-only; the anchor-bypass path exists and is unit-tested for when that lands. Session-scoping the dedup is deliberately approximate: only `inject` events carry `session`, so "was this acked" is a time-ordered proxy (any `ack` after the `inject`, log-wide) rather than a strict per-session join — same looseness [[runstophook-does-structural-citation-attribution]]'s surfaced-set already accepts. A `// TODO(compaction-reset)` comment marks the seam in `priorInjectionsFor` where a future PreCompact-driven marker would need to stop counting pre-compaction injects toward the dedup (out of scope here — needs cross-hook coordination). Calibration script and full sampled output are not committed; rerun `nc.search`/`rankedSearch` against representative prompts if the floor ever needs re-tuning.
