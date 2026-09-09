---
id: 004ca01f-6402-4a4e-a51c-e0ff38c3dedc
scope: global
anchors:
  - locator: src/mcp/instructions.ts › const INSTRUCTIONS
    hash: c940cf53842ddb524f334fd25a27bcebcfa86b5f4f94a932d67284dd7b8d8e15
    artifactPath: src/mcp/instructions.ts
edges: []
validFrom: '2026-09-08T23:50:58.241Z'
validTo: null
txnTime: '2026-09-08T23:50:58.241Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: claim
---

The contract's capture leg is event-anchored like its siblings (search BEFORE, worklist AFTER): memory_remember fires at three named moments — the user states a decision/preference/constraint (a user-stated directive is authority "invariant"), a non-obvious choice whose rationale won't survive in the diff (capture before moving on), and task end before the summary (one look back). Authority is provenance-based: "invariant" = a directive the user stated or a convention that must outrank contradicting defaults; the agent's own conclusions stay "default". An empty memory_search result teaches capture ("if you learn the answer, it is a memory_remember candidate") — the one call-time moment memory is known to not know. Reason: He's first external-repo dogfood (2026-09-09) found agents under-capture and mislabel authority when the trigger was a category ("WHEN you learn something") instead of a moment; positive framing beats negatives (He).
