---
id: 69b4fda0-6f24-45b6-be8e-c1543a5b8ec2
summary: 'Benchmark: Track A deterministic LLM-free replay over real repo histories; Track B quality-per-token with mechanical ground truth and self-ablations.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T11:32:13.108Z'
validTo: null
txnTime: '2026-09-17T11:32:13.108Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Benchmark design (2026-09-17, analysis pending He's ratification): two tracks, because the marketing claim ("deterministic correctness at ~zero token cost") is substantiated by an LLM-free track, while task quality needs agent runs.

**Track A — deterministic, LLM-free, CI-able.** Fixtures are real public OSS repos' git histories (solves "no sizeable projects to test on" — a repo history IS the sizeable project) plus nocetta's own dogfood store. Replay: capture memories at old commits grounded in real changes, advance to later commits, measure with mechanical ground truth — stale-sacts-served rate (nocetta: 0 by construction, the differentiator), retrieval precision/recall at HEAD, token accounting (index/query overhead, injected body tokens, capture cost per fact), push-recall false-positive rate (generalizes the NOCETTA_PUSH_FLOOR calibration sampling into a harness). Competitor numbers come from their own published measurements (Mem0's paper put Zep at 600k tokens/conversation) or cents-scale local runs of their OSS on the same fixture.

**Track B — task-quality per token.** Formalize the metric He named: report (success_rate, tokens_per_task) per arm — success at equal token budget or tokens-per-successful-task, never a single blended number, because memory systems trade recall against noise and the Pareto IS the product claim. Tasks derive from repo history with mechanically checkable ground truth (renames, deprecations, moved symbols — judgeable by symbol lookup, no LLM judge); a small LLM-scored pilot for end-to-end agent tasks runs on nocetta+sandkeep recorded sessions only. Baselines: no-memory, full-context dump, and ABLATIONS of nocetta itself (anchoring off, push-recall off, ledger pruning off) — beating your own ablations is the scientifically strongest and cheapest comparison and needs no competitor infrastructure.

**How to apply:** respects the dogfood invariant (replay recorded real sessions over real history — no synthetic fantasy workload); the recall-log/value-ledger data is pre-labeled ground truth (working/prunable quadrants). Publish as a protocol others run, not infrastructure He funds. Fixture #1: replay nocetta's own store over its 73-commit history.
