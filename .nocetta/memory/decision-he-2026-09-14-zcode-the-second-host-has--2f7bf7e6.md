---
id: 2f7bf7e6-aebd-47a6-b0d6-d3d78144d9f0
summary: Plugin v0.0.2 wires SessionStart matcher "compact" to hook pre-compact for ZCode, which lacks PreCompact; verification pending a real compaction
scope: global
anchors:
  - locator: src/recall/pre-compact-hook.ts › function runPreCompactHook
    hash: e3f286eccb7ee8988a2ff800ca8db4302edad9bf29c3110c485e95926b345d07
    artifactPath: src/recall/pre-compact-hook.ts
edges: []
validFrom: '2026-09-14T21:03:34.840Z'
validTo: null
txnTime: '2026-09-14T21:03:34.840Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-14): ZCode (the second host) has no PreCompact event (it supports exactly seven; SessionStart matchers are startup/resume/clear/compact), so the plugin (v0.0.2) adds a `SessionStart` entry with matcher `compact` running the SAME `hook pre-compact` command — no new code. Marker timing post-compaction is fine: priorInjectionsFor only needs the marker to exist before the next UserPromptSubmit evaluates dedup. Also harmless on Claude Code (a second marker alongside PreCompact, same net effect).

**Why:** the compaction marker must land before the next push-recall evaluation, and SessionStart:compact is the only harness-documented compaction signal ZCode offers. The rejected alternative — UserPromptSubmit transcript-boundary scanning — needs a transcript_path ZCode doesn't document and a structured marker its rollout files don't carry (checked: only prose hits for "compact" in ~/.zcode/cli/rollout).

**How to apply:** unverified until a real compaction happens: (1) whether ZCode actually fires SessionStart:compact — verify a `compaction` event appears in .nocetta/recall-log.jsonl; (2) whether ZCode rolls a NEW session id on compaction — if it does, the per-session dedup self-heals and this hook is belt-and-braces only. If both fail, the fallback is a stdin probe then transcript scanning.
