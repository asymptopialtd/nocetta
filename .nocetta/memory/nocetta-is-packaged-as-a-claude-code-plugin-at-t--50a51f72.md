---
id: 50a51f72-93c3-4b93-bd39-e615b84220fc
summary: 'nocetta is a repo-root Claude Code plugin: hooks/hooks.json auto-loads (never reference it in the manifest), MCP uses a non-default nocetta.mcp.json that IS referenced.'
scope: global
anchors: []
edges:
  - type: supersedes
    target: 81ba0b41-4ba8-4315-a6df-119596f3fd2b
validFrom: '2026-09-10T13:36:22.868Z'
validTo: null
txnTime: '2026-09-10T13:36:22.868Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

nocetta is packaged as a Claude Code plugin at the repo root (`.claude-plugin/plugin.json`), bundling the MCP server and the citation Stop hook so one install wires both, no `settings.json` editing.

**Why:** the two config files load by OPPOSITE mechanisms, and getting it wrong errors on install:
- Hooks — `hooks/hooks.json` at the default path is AUTO-loaded. The manifest must NOT also reference it: a `"hooks": "./hooks/hooks.json"` line double-loads and fails install with "Duplicate hooks file detected." The manifest `hooks` field is only for ADDITIONAL, non-default hook files.
- MCP — the config is `nocetta.mcp.json` (NON-default name) and IS referenced from the manifest `mcpServers` field. It is deliberately not the default `.mcp.json`, because a root `.mcp.json` is auto-loaded as a PROJECT MCP config where `${CLAUDE_PLUGIN_ROOT}` does not resolve — breaking while dogfooding inside the repo. A non-default name isn't auto-loaded, so it loads once (via the manifest) and only in plugin context.

Plugins are the ergonomic Claude Code delivery but NOT portable across harnesses, so the plugin is a THIN wrapper over the portable core (MCP server + `nocetta hook stop` CLI); only the auto-wiring is Claude-Code-specific.

**How to apply:** commands reference `${CLAUDE_PLUGIN_ROOT}/dist`, so a git checkout needs `pnpm build` before `--plugin-dir`/marketplace works (dist is gitignored, ships in the tarball). The repo is also a single-plugin marketplace (`.claude-plugin/marketplace.json`, plugin `source: "./"`): add it, then `/plugin install nocetta@nocetta`; a git-URL clone lacks dist. Stays closed-source (private marketplace / `--plugin-dir`, never the public community marketplace). The Stop hook stdin payload is Claude Code-shaped; another harness needs a small adapter. Relates to [[runstophook-does-structural-citation-attribution]] and [[the-claude-code-hook-lifecycle-mapped-to-nocetta]].
