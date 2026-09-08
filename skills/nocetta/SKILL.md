---
name: nocetta
description: Anchored agent memory. Load this skill when the repo has a .nocetta/ directory (agent memory served by the nocetta MCP server) — it is the when-and-why of capture, recall, and drift repair.
---

# nocetta — the memory contract

## What this is

Anchored memory in `.nocetta/`: facts are tied to the code artifacts they describe and
detect their own staleness; recall never serves a superseded, retired, or dirty fact as
current. The six MCP tools are self-sufficient — this file is the when-and-why.

## When to remember

Durable facts only — what a future session cannot recover from the repo:

- Decisions and their why. "Retry is capped at 3 because the upstream rate-limits" — the
  cap is in the code, the because is not.
- Claims about code behavior ("foo retries 3 times, then gives up") — anchored to the
  symbol, so the fact knows when the code stops matching it.
- Entity definitions — what a proper noun means, and the aliases it answers to.

Never transient state. What you are doing right now, task lists, the diff, the commit
message, file contents — git already records those. If git can tell the next agent,
memory shouldn't store it. Secrets are refused by the write gate, correctly.

## When to recall

- **Before editing a file** — pass the paths you are about to touch as files_in_play;
  memories anchored to them surface first.
- **When a question smells like a decision someone already made** — keyword search beats
  re-deriving.
- **When something contradicts what you remember** — search first; if the stored belief
  is genuinely wrong, supersede it. Never remember a conflicting duplicate — the store
  keeps both and flags the conflict, and every later session inherits the argument.

## The worklist is the loop

After a refactor — or whenever unsure — call memory_worklist: every dirty node means the
code this fact is anchored to changed since capture. Close each item with the right action:

- **reanchor** — the belief still holds, the code moved. Locator and hash are rewritten
  in place; the belief is untouched.
- **supersede** — the belief changed. New node; the old one stays as history.
- **retire** — the belief is gone (its subject is gone). The validity window closes.

Dirty memories are excluded from recall automatically — staleness is structural, not a
vibe. The worklist is how they stop being dirty.

## Capture rules

- Anchor to the exact symbol or heading; unknown or ambiguous names are refused with
  candidates — fix and retry. An unanchored fact never goes stale — another way of
  saying it will eventually lie.
- kind, one line: claim = fact about code, value = decision or convention, entity = a
  thing and its aliases, lore-fact = fact about docs/plans.
- authority: leave "default". "invariant" is for rules that must never be overridden —
  it outranks contradicting defaults, so it is expensive to be wrong about.

## The moves

Remember a claim about code, anchored to the symbol it describes:
```json
{"body": "fetchWithRetry gives up after 3 attempts, then returns the cached response", "kind": "claim", "artifact_path": "src/retry.ts", "symbol": "fetchWithRetry"}
```

Recall by files in play (before editing) — or by keyword (when it's a decision question):
```json
{"files_in_play": ["src/retry.ts"]}
{"keyword": "why is retry capped at 3"}
```

Correct a belief — find old_id with memory_search first; the old node is never deleted:
```json
{"old_id": "<id from memory_search>", "body": "fetchWithRetry now fails fast instead of retrying"}
```

See what needs attention — dirty nodes with reasons, conflicts, quarantined files:
```json
{}
```

Close a worklist item — reanchor while the belief holds, retire when it is gone:
```json
{"node_id": "<id from memory_worklist>", "action": "reanchor", "symbol": "fetchWithRetry"}
{"node_id": "<id from memory_worklist>", "action": "retire", "reason": "fetchWithRetry deleted"}
```

Provenance — what did we believe at time T (superseded and retired facts included):
```json
{"at": "2026-06-01T00:00:00Z"}
```
