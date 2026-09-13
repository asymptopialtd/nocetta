---
id: 9e1f9c31-1f75-460e-b0df-cc8756c154c3
summary: 'Per-turn push-recall must be cooperative, never nagging or forcing: default to silence, inject only as dismissible background, never as an instruction.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-13T21:31:16.417Z'
validTo: null
txnTime: '2026-09-13T21:31:16.417Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

DECISION (He, 2026-09-13): the future UserPromptSubmit push-recall (the "hold until precision is proven" item 4 of the hook-lifecycle plan) must be cooperative — never nagging, never forcing. It defaults to silence (a weak turn injects nothing) and frames any injection as dismissible background the agent may ignore, never as an imperative the agent must act on.

**Why:** an agent's user is often already emotional and applying pressure and urgency of their own — memory that nags or forces adds fuel to the fire rather than helping. And the quietwork lesson applies directly: a nudge that fires unconditionally and identically every turn gets tuned out wholesale, taking its real signal down with it — this is [[noise-is-a-product-killer]] applied to context injection. Forcing also causes tangents: a belief injected as an instruction pulls the agent off the task it was actually asked to do, and a false-positive match phrased imperatively is worse than silence.

**How to apply:** gate injection on an ABSOLUTE relevance floor, not just top-N — `applyBudget` caps count and body size but has no score floor, and `candidatesFromKeyword` admits any BM25 `score > 0` (a single shared common word), so top-1-by-score always injects something; add a calibrated floor so most turns inject nothing. Cap at one. Prefer anchor-gated candidates (×10 in `rankCandidates`, self-limiting) over free-text keyword hits; keyword push is the narrow high-floor exception. Frame the injection summary-only and explicitly optional ("a current belief about X; ignore if off-topic") so the agent pulls the body via memory_search only if it decides it is relevant — agency preserved, so a stray memory can offer but never force a tangent. `filterLive` already guarantees current-only, so staleness is not the risk here; salience and noise are. Measure with [[the-recall-value-ledger-2x2]] — injected-but-never-used is the signal to raise the floor. Governed by [[the-claude-code-hook-lifecycle-mapped-to-nocetta]].
