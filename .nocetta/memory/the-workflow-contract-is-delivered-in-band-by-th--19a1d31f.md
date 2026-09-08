---
id: 19a1d31f-c656-4c77-b64d-3cf71aaf60b4
scope: global
anchors: []
edges: []
validFrom: '2026-09-08T22:52:05.273Z'
validTo: null
txnTime: '2026-09-08T22:52:05.273Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

The workflow contract is delivered in-band by the server, never as skill files (He, review round 3): skills are probabilistic delivery — loading them is model-mediated and agents do not consistently do it — while the MCP instructions field arrives at handshake, tool descriptions at tools/list, and tool outputs at call time. The contract's single source is src/mcp/instructions.ts, injected as the server's instructions; tool descriptions and outputs carry the mechanics. Project-specific rules belong in the adopting project's AGENTS.md, not in nocetta.
