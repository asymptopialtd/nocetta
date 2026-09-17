---
id: 0132a2f8-5266-4f1c-9987-832271ce2157
summary: 'License posture: MIT + CLA when nocetta publishes (supersedes closed-until-adoption).'
scope: global
anchors: []
edges:
  - type: supersedes
    target: 7436e190-6676-4974-97f8-827f6cd581d6
validFrom: '2026-09-17T10:26:19.495Z'
validTo: null
txnTime: '2026-09-17T10:26:19.495Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

License posture decided (He, 2026-09-17): nocetta publishes under MIT + CLA — supersedes the closed-until-adoption posture. **Why:** working the monetization path showed donations-only is the worst corner: the architecture leaves exactly two real revenue seams — a local-first team merge/governance service (coordination, not custody; supersession-aware DAG merge is uniquely ours, git cannot do it) and funded development (SQLite-consortium style: sell roadmap certainty, not code) — and both need adoption, which a closed repo forfeits while gaining nothing (the thesis is already public in README/PLAN; compiled dist was never the secret). The visibility-dependent channels (career capital, acquisition optionality) also route through adoption. **How to apply:** add LICENSE (MIT) and a CLA with copyright grant BEFORE accepting the first external PR — sole copyright ownership is what keeps dual-licensing and relicensing open. Memory-exposure concern was resolved by audit (2026-09-17): all 39 store files contain zero competitor names, secrets, or personal references; the competitive analysis lives only in public-facing README/PLAN prose. Before the repo goes public, audit git history for deleted or old memory versions — fresh-start orphan branch if anything needs redaction; retire is not redaction (the body stays), hand-edit is.
