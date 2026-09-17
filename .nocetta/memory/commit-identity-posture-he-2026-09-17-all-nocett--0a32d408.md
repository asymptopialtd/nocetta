---
id: 0a32d408-7b56-48cd-bb51-e56f5bf41457
summary: 'Commit identity: noreply of asymptopialtd account only; real inbox never in history; rewrite done 2026-09-17.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T10:51:08.483Z'
validTo: null
txnTime: '2026-09-17T10:51:08.483Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

Commit identity posture (He, 2026-09-17): all nocetta commits are authored as `He Zhu <308729262+asymptopialtd@users.noreply.github.com>` — the noreply of the asymptopialtd GitHub account — and the real inbox (zhu.he@asymptopia.dev) never enters git history. The pre-publication history was rewritten with git-filter-repo on 2026-09-17 and force-pushed (73 commits, all identities verified noreply-only, zero residual).

**Why:** the name↔company↔project link is public by design (LICENSE © Asymptopia Ltd; Companies House publishes director names), so the only thing git uniquely exposed was the deliverable inbox — permanent spam surface once public. The rewrite had to happen before publication: after forks/clones exist it is practically impossible.

**How to apply:** never set a repo-local user.email back to a real address — check `git config user.email` on new clones/machines before committing. The mirror backup at /Users/he/projects/nocetta-backup-20260917 is the one place the old identity still exists; keep it private, delete it once the rewrite is trusted. Old pre-rewrite commits may remain reachable by direct SHA in GitHub's cache until GC — harmless while the repo is private.
