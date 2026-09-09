---
id: c23fa5a4-63ed-4f20-b7e3-ad16b68ef032
summary: Onboarding an existing project is a once-per-project MCP prompt (`onboard`), off the six-tool cap — not server instructions, a CLI, or a seventh tool.
scope: global
anchors:
  - locator: src/mcp/onboard.ts › const ONBOARD_PROMPT
    hash: 13dd8ad1add1ecd63e731f6b034152805b7c4fc23fe20efcbc010dd698f9f02e
    artifactPath: src/mcp/onboard.ts
edges: []
validFrom: '2026-09-09T13:52:22.657Z'
validTo: null
txnTime: '2026-09-09T13:52:22.657Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Seeding an already-existing project into nocetta lives as a once-per-project MCP prompt named `onboard`, deliberately not in the server INSTRUCTIONS, not a CLI command, and not a seventh tool.

**Why:** the seeding protocol runs at most once per project, so it must not ride the always-present INSTRUCTIONS context budget every session pays for. The distillation is agent judgment — read the corpus, decide what is load-bearing — which a CLI cannot do (a CLI could only print a constant string). An MCP prompt is invoked on demand and sits off the six-tool cap (the cap is about tools; a prompt is a different capability class), which is exactly the shape a once-per-project payload wants. `nocetta init` stays a non-goal: the store self-creates on first remember.

**How to apply:** keep the prompt substrate-neutral (it seeds code or canon alike — only anchor surface and kind differ), keep receipt-as-gate (a belief with no resolvable anchor never gets written — lean on resolveAnchor's refusal rather than a polite ask), and keep the tone investigative discipline (cite, doubt, stop) not a detective persona, because the failure mode it guards against is inventorying the whole corpus. Order is rules (authority "invariant", human-ratified) → load-bearing facts → explicit stop. The channel was chosen ahead of the retrofit dogfood (He, 2026-09-09); promote a `nocetta onboard` CLI only if that dogfood shows the agent flailing to find the substrate, and then only for substrate detection + a pre-filled prompt, never string-printing. Relates to [[retrofit-onboarding-scaffold-deferred]] and the capture contract [[instructions-capture-three-moments]].
