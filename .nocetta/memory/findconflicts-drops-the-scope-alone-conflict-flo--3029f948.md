---
id: 3029f948-5981-47f3-9a52-ba58ae799f68
summary: findConflicts suppresses the scope-alone flood with a fan-out cap, not a per-pair overlap threshold.
scope: global
anchors:
  - locator: src/supersede/conflicts.ts › function findConflicts
    hash: 2c497bd4e62068427eb8ab77933b551dc8b0f322ad89a650534ed6460e7631b3
    artifactPath: src/supersede/conflicts.ts
edges: []
validFrom: '2026-09-10T13:16:21.487Z'
validTo: null
txnTime: '2026-09-10T13:16:21.487Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

findConflicts drops the scope-alone conflict flood with a fan-out cap: an UNANCHORED node whose candidate conflicts exceed MAX_UNANCHORED_FANOUT (3) is a grazer and its conflicts are removed. The per-pair gate stays permissive — one shared non-ambient (discriminating) token makes a candidate.

**Why:** a per-pair overlap threshold cannot separate a real conflict from a graze — a terse genuine conflict ("all SQL is parameterized" vs a string-concat default) shares as little vocabulary as a broad node grazing an unrelated belief (one word, "sql"), so any threshold high enough to kill the flood silences real conflicts too (the capture-test SQL pair proved it). What separates them is fan-out: the 2026-09-10 flood was one broad default value grazing eleven invariants, while every genuine conflict pairs one-to-one — "a belief that contradicts everything contradicts nothing." This was the SECOND incarnation of the scope-alone flood; the first was patched with the discriminating-token gate ([[noise-is-a-product-killer]]), which a wide-ranging node slips past.

**How to apply:** fan-out suppression runs ONLY on unanchored groups — an anchored group's shared locator IS the subject and never grazes, so anchored candidates are emitted whole. MAX_UNANCHORED_FANOUT=3 is the single knob; raise it only if a real belief legitimately contradicts many invariants (rare — better surfaced as one meta-issue). The flood was surfaced by capturing [[the-claude-code-hook-lifecycle-mapped-to-nocetta]] as a broad default value.
