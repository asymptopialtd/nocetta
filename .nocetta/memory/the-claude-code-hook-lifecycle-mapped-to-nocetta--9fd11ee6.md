---
id: 9fd11ee6-76fa-445d-8a11-7b1a637c05bf
summary: 'Claude Code hook-lifecycle map for nocetta: PreToolUse can''t inject, so Stop (built) then PostToolUse are the integration path.'
scope: global
anchors: []
edges:
  - type: superseded-by
    target: 5970a7bc-0989-400e-a710-5948897095e8
validFrom: '2026-09-10T12:32:01.289Z'
validTo: '2026-09-10T12:33:39.122Z'
txnTime: '2026-09-10T12:32:01.289Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

The Claude Code hook lifecycle, mapped to nocetta integration (researched from the hooks docs, 2026-09-10). Which events can inject context the model sees is the deciding constraint.

**Why:** the key finding — **PreToolUse CANNOT inject context** (block/allow only). So "auto-recall before every edit" cannot be a clean context injection; the hook that fires before an Edit can only block it. Injection-capable events: PostToolUse, UserPromptSubmit, Stop, SubagentStop, SessionStart (via hookSpecificOutput.additionalContext). Non-injecting: PreToolUse, PreCompact, SessionEnd, Notification.

**How to apply:** ranked nocetta integrations — (1) DONE: **Stop** → structural citation ack [[runstophook-does-structural-citation-attribution]]; (2) next: **PostToolUse** on Edit/Write → surface memories anchored to the just-edited file + a dirty warning (recall can't be made ambient BEFORE the edit, so do it immediately after, where injection works); (3) **SessionStart** → inject dirty count so the agent opens by clearing drift (gate on dirty>0); (4) **UserPromptSubmit** → keyword-recall on the prompt (powerful but noise-risky — hold until precision is proven). Skip: PreToolUse hard-block (intrusive) and PreCompact capture-nudge (can't inject, so it can't prompt a capture pass — the idea I raised is dead). All hooks ship as `nocetta hook <event>` CLI subcommands + a settings.json pointer, off the six-tool cap. Relates to [[the-recall-value-ledger-2x2]] and [[the-mcp-tool-surface-is-capped-at-six-tools]].
