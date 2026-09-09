---
id: 590f5c83-dc54-4c3b-bce6-ef341263df9c
scope: global
anchors:
  - locator: README.md#Memory file format
    hash: d8ae0285cd6318ebb63f60bb5d8f6a23a41970047a244ccdb488c5026eef34f0
    artifactPath: README.md
edges: []
validFrom: '2026-09-08T17:04:32.529Z'
validTo: null
txnTime: '2026-09-08T17:04:32.529Z'
authority: default
overrideReason: null
version: 1
kind: value
---

Memory files are named <slug>--<id8>.md — a kebab slug of the body plus the first 8 chars of the id. The filename is a label for humans browsing ls or git log; identity is always the frontmatter id. Settled 2026-09-08 (He): UUID-only filenames failed the human-exploration bar.
