---
id: e9a8ad13-a6f8-4fa6-8c43-7be721596a10
summary: 'Multi-user scope: DAG makes divergence data — merge is a local command, CRDTs rejected; core merge stays MIT, coordination is the paid tier.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T11:05:40.149Z'
validTo: null
txnTime: '2026-09-17T11:05:40.149Z'
authority: default
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Multi-user scoping (2026-09-17, analysis pending He's ratification): the supersession DAG already makes concurrent divergence representable, so multi-writer merge is a local deterministic command, not a server. Failure classes with N writers: (A) disjoint captures — git-clean, INDEX.md is a rebuildable fold; (B) same node stamped on both branches (validTo/edges) — resolve by set-union of edges, fan-in is already allowed; (C) semantic duplicates — not a git conflict at all, findConflicts territory, propose restates/supersedes; (D) genuine contradiction — union-merge yields two live tips, and that is DATA the worklist arbitrates, not corruption. Cross-machine txnTime skew needs a deterministic tie-break (txnTime, nodeId) so merge(A,B)=merge(B,A) without a server. **Why:** non-destructive supersession means merge never destroys information — divergence is held visible until arbitrated. CRDT/live-sync rejected on purpose: CRDTs converge syntactic state, but memory conflicts are semantic (contradiction); auto-resolution would silently pick a belief, the destructive behavior nocetta exists to avoid. Same-checkout agent swarms are already live (store reads the filesystem, not git); the only real gap is the teammate's unpushed window, closed by commit cadence now, a managed relay only in the paid tier. **How to apply:** open/proprietary boundary — the correctness path (merge, dedup, tip policy, INDEX regen) stays MIT core (trust + OSS contributors need it; lock-in kills the local-first story); proprietary is coordination/governance only (org cross-repo graph+search, sharing/secrets policy, audit exports off the bitemporal history, managed sync, org ledger). Repo structure: this repo stays the public core untouched; the team tier is a separate private repo consuming the public package via its existing library exports — never private code inside the public repo (the leak class the identity rewrite just excised). BACKLOG shape: new seam after the vector phase or parking lot with promotion condition "second contributor or first team trial".
