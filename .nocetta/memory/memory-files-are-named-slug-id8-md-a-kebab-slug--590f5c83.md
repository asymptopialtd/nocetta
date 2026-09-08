---
id: 590f5c83-dc54-4c3b-bce6-ef341263df9c
scope: global
anchors:
  - locator: README.md#Memory file format
    hash: 7d1519e4f9b9d5c097695e74f511a607ce0d695d583fb65f755ae400cd055433
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
