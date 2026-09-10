---
id: 5be85c0c-dd57-4fcc-95fa-0acc2ceb63fa
summary: The recall log is local per-machine telemetry, kept uncommitted by a nocetta-owned .nocetta/.gitignore.
scope: global
anchors: []
edges: []
validFrom: '2026-09-10T12:04:45.298Z'
validTo: null
txnTime: '2026-09-10T12:04:45.298Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-10): the recall log lives at `.nocetta/recall-log.jsonl` (sibling of the committed memory store) but is never committed — `appendRecall` maintains a `.nocetta/.gitignore` that excludes it.

**Why:** the log is per-recall churn and per-machine usage; committing it would fight the pristine store and make the ledger a merge battleground, and a personal payout record is honestly per-machine. Auto-managing a `.gitignore` INSIDE `.nocetta/` (which nocetta owns) never touches the user's root `.gitignore` — no surprise diff, no manual tax — while the ignore rule is itself committed, so every clone ignores its own local log with zero setup. This beat storing the log outside the project (e.g. ~/.local/state): that trades a solved auto-ignore for two unsolved problems — keying logs to a repo by absolute path (breaks on clone/rename/move) and "where did my data go" invisibility.

**How to apply:** keep the log in-project; `ensureIgnored` is idempotent (adds the line once, never clobbers existing rules). Writes are best-effort and empty-id-dropped — telemetry must never break or slow the recall path, so every fs failure is swallowed and a null recall logs nothing. Reads skip corrupt lines rather than throw (the ledger is a report, not a gate). The `.nocetta/.gitignore` is a committable artifact of the feature. Relates to [[the-recall-value-ledger-2x2]] and [[the-canonical-store-layout-is-reporoot-nocetta-memory]].
