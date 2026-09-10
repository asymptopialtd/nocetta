---
id: b894b51d-ac6a-401d-944f-d88874082247
summary: The Stop hook attributes citation structurally (surfaced ∩ edited-its-anchored-file), never by text; citation-only, never injects.
scope: global
anchors:
  - locator: src/recall/stop-hook.ts › function runStopHook
    hash: 86cb217a15081d975a3134b82648e778aed08eebcafa22a1d2d1364b1ea48b6b
    artifactPath: src/recall/stop-hook.ts
edges: []
validFrom: '2026-09-10T12:31:41.805Z'
validTo: null
txnTime: '2026-09-10T12:31:41.805Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

`runStopHook` (src/recall/stop-hook.ts, shipped as `nocetta hook stop`) is rung 2's automatic citation capture: it credits a memory as used when it was surfaced by some recall (in the log) AND is anchored to a file the turn just edited (from the Stop payload's turn_tool_calls), appending an `ack` event.

**Why:** attribution is STRUCTURAL, not text-matching — an answer sharing vocabulary with a memory is not evidence of use, and a false "cited" is exactly the noise that kills trust (He, 2026-09-10). The surfaced ∩ edited-anchored-file signal reuses nocetta's own anchor semantics, needs no inference, no agent burden, and closes the last-recall gap [[ack-on-next-search-is-the-citation-signal]] leaves. It is the strictly-better out-of-band path promised there, now built and confirmed viable: the Stop hook CAN inject context but this one deliberately does NOT — citation-only, a side-effect on the local log, so a hook firing every turn adds zero context noise.

**How to apply:** hooks are user-installed (a settings.json pointer to `nocetta hook stop`), off the six-tool MCP cap — management, CLI-homed. Bad/absent stdin degrades to a no-op (a telemetry hook must never fail the turn). used_ids stays the portable in-band fallback for hosts without hooks; the always-on INSTRUCTIONS nudge for it was trimmed once the hook made it reliable on Claude Code. Relates to [[the-recall-value-ledger-2x2]] and [[claude-code-hook-lifecycle-map-for-nocetta]].
