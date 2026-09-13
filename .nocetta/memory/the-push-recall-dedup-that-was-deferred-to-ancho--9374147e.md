---
id: 9374147e-640a-466d-a31b-7ef8653692a7
summary: 'Push-recall dedup is source-aware and compaction-resettable: an anchor overrides a prior keyword-ignore but a prior anchor or an ack suppresses; a PreCompact marker resets the session window.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-13T22:22:43.751Z'
validTo: null
txnTime: '2026-09-13T22:22:43.751Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

The push-recall dedup that was deferred to "anchor bypasses all dedup" is now source-aware, and a PreCompact hook resets the per-session window. (Completes the deferrals in the calibration note [[the-userpromptsubmit-push-recall-hook-nocetta-hosts-the-first-injecting-hook]]; governed by the cooperative invariant and [[the-claude-code-hook-lifecycle-mapped-to-nocetta]].)

**Why:** letting an anchor match bypass ALL dedup nags — if the user keeps naming a file, its anchored memory would re-inject every turn. So `selectPushRecall` (src/recall/push-recall.ts) suppresses an anchor when the memory was already used (`acked`) OR already surfaced via anchor this session; it overrides ONLY a prior *keyword* injection (possibly a false positive the agent ignored) — that is the "anchor beats a keyword false-positive later" case, not a licence to repeat. This required threading the injection `source` ("anchor"|"keyword") through the recall-log `inject` event and `PriorInjection.viaAnchor`. Separately, session dedup is only correct while the injection is still in context: once a compaction summarizes it away, "the agent already saw this" is false, so suppression should lapse. PreCompact can't inject context but CAN leave a side-effect, so `runPreCompactHook` writes a `compaction` marker and `priorInjectionsFor` ignores injects at/before the session's latest marker.

**How to apply:** prompt file-paths are extracted by `extractFilePaths` with a deliberately conservative slash-requiring regex (a bare filename never matches a full repo-relative anchor path anyway, and a non-matching path is harmless — it just finds no anchor), which is what makes the anchor path reachable live. A session-less compaction marker (PreCompact with no session_id) is a global reset — the conservative fallback. All three hooks (Stop, UserPromptSubmit, PreCompact) are wired in hooks/hooks.json. The ack-after-inject "used" check stays a time-ordered proxy (ack events aren't session-tagged), same looseness the Stop hook already accepts.
