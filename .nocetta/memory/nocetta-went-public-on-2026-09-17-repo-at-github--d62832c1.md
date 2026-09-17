---
id: d62832c1-b8e8-4e1b-a633-feb262b56b58
summary: 'Nocetta public 2026-09-17: repo + npm v0.0.2 verified; dangling-SHA GC and CLA automation optional follow-ups.'
scope: global
anchors: []
edges: []
validFrom: '2026-09-17T11:26:26.649Z'
validTo: null
txnTime: '2026-09-17T11:26:26.649Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: lore-fact
---

Nocetta went public on 2026-09-17: repo at github.com/asymptopialtd/nocetta (public, MIT, description+topics set) and npm package `nocetta` v0.0.2 published (registry install, facade import, and MCP initialize handshake all verified from a clean scratch project). The license-posture condition (0132a2f8) has fired: MIT + CLA are live, CLA.md v1.0 signs by PR statement until cla-assistant is wired.

**Why:** the go-public sequence was executed in order — metadata/README refresh before publish, repo public before npm, dangling-SHA check at the flip — and the check found one open item: GitHub still serves the pre-rewrite commit (old email) by exact SHA via the .patch endpoint and API, though not the HTML page. Reachable only by the full 40-char SHA, which was never published anywhere; negligible practical risk.

**How to apply:** optional follow-ups, none blocking — GitHub Support can GC the dangling objects on request (no downtime); delete /Users/he/projects/nocetta-backup-20260917 once the rewrite is trusted (it is the only place the old identity lives); CLA automation before the first external PR; and the MCP server's serverInfo.version reports a hardcoded "0.0.1" (package is 0.0.2) — fix to read package.json at the next release, since 0.0.2 on npm is immutable.
