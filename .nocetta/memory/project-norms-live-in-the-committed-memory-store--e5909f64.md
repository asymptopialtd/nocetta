---
id: e5909f64-6031-44bc-894d-327e77fc017e
summary: Project norms live as memories in the committed store, not AGENTS.md — the store ships to every contributor's agent.
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T10:33:44.009Z'
validTo: null
txnTime: '2026-09-17T10:33:44.009Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Project norms live in the committed memory store, not AGENTS.md (He runs no AGENTS.md — he leaves agents to decide their own setup, 2026-09-17). Since the store ships with the repo, every contributor's nocetta instance inherits the norms on day one: the memory store IS the project's agent-config — no separate instruction-file mechanism to adopt.

**Why:** AGENTS.md delivery is deterministic but depends on a convention He doesn't use; store delivery is recall-gated but rides the channel nocetta already is. The division of labor that falls out: hard rules → code gates (the writeNode never-leak gate — deterministic by construction), the universal workflow contract → in-band server instructions (handshake/tools/list), norms and judgment → memories (probabilistic delivery is acceptable exactly where enforcement would be wrong).

**How to apply:** first instance is the public-store register norm, adopted with the MIT + CLA license posture (2026-09-17): memories in a public repo are working notes phrased as technical judgments — competitor comparisons as measurable trade-offs (the README/PLAN register), never snark, nothing about people, no strategy phrased as leakage. Pre-publish hygiene stays the grep audit (competitor names, secret patterns, personal references), not a standing rule.
