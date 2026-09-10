---
id: 5970a7bc-0989-400e-a710-5948897095e8
summary: 'Claude Code hook-lifecycle map for nocetta (ratified plan): PreToolUse can''t inject, so Stop (built) then PostToolUse are the path.'
scope: global
anchors: []
edges:
  - type: supersedes
    target: 9fd11ee6-76fa-445d-8a11-7b1a637c05bf
validFrom: '2026-09-10T12:33:39.122Z'
validTo: null
txnTime: '2026-09-10T12:33:39.122Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

The Claude Code hook lifecycle mapped to nocetta integration — the plan He ratified 2026-09-10 ("start with the stop hook and the rest of your recommendations"). Which events can inject context the model sees is the deciding constraint.

**Why:** the key finding — **PreToolUse CANNOT inject context** (block/allow only). So "auto-recall before every edit" cannot be a clean context injection; the pre-edit hook can only block. Injection-capable events: PostToolUse, UserPromptSubmit, Stop, SubagentStop, SessionStart (hookSpecificOutput.additionalContext). Non-injecting: PreToolUse, PreCompact, SessionEnd, Notification.

**How to apply:** ranked nocetta integrations — (1) DONE: **Stop** → structural citation ack [[runstophook-does-structural-citation-attribution]]; (2) next: **PostToolUse** on Edit/Write → surface memories anchored to the just-edited file + a dirty warning (recall can't be ambient BEFORE the edit, so do it right after, where injection works); (3) **SessionStart** → inject dirty count so the agent opens by clearing drift (gate on dirty>0); (4) **UserPromptSubmit** → keyword-recall on the prompt (powerful but noise-risky — hold until precision is proven). Skip: PreToolUse hard-block (intrusive) and PreCompact capture-nudge (can't inject, so it can't prompt a capture pass). All hooks ship as `nocetta hook <event>` CLI subcommands + a settings.json pointer, off the six-tool cap. Relates to [[the-recall-value-ledger-2x2]] and [[the-mcp-tool-surface-is-capped-at-six-tools]].
