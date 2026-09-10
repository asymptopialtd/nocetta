---
id: 81ba0b41-4ba8-4315-a6df-119596f3fd2b
summary: nocetta ships as a Claude Code plugin (repo root) bundling the MCP server + Stop hook; MCP config is nocetta.mcp.json, not .mcp.json, to dodge the project-config collision.
scope: global
anchors: []
edges:
  - type: superseded-by
    target: 50a51f72-93c3-4b93-bd39-e615b84220fc
validFrom: '2026-09-10T13:22:50.565Z'
validTo: '2026-09-10T13:36:22.868Z'
txnTime: '2026-09-10T13:22:50.565Z'
authority: invariant
overrideReason: null
retiredReason: null
version: 1
kind: value
---

nocetta is packaged as a Claude Code plugin at the repo root: `.claude-plugin/plugin.json` bundles the MCP server and the citation Stop hook, so one install wires both with no `settings.json` editing.

**Why:** plugins are the ergonomic Claude Code delivery but are NOT portable across harnesses, so the plugin is a THIN wrapper over the portable core (the MCP server + the `nocetta hook stop` CLI) adding only the auto-wiring. The MCP config is named `nocetta.mcp.json` and referenced from the manifest's `mcpServers` field, deliberately NOT the default `.mcp.json`: a root `.mcp.json` is auto-loaded by Claude Code as a PROJECT MCP config, where `${CLAUDE_PLUGIN_ROOT}` does not resolve — it would break while dogfooding inside the nocetta repo itself. `hooks/hooks.json` has no such collision (project hooks live in settings.json, not that path).

**How to apply:** commands reference `${CLAUDE_PLUGIN_ROOT}/dist/...`, so a git checkout must be built (`pnpm build`) before `claude --plugin-dir /path/to/nocetta` works — dist is gitignored but ships in the tarball. The server still discovers the project root from cwd (no NOCETTA_ROOT needed). Distribution stays closed-source: `--plugin-dir` or a private marketplace, never the public community marketplace. The Stop hook's stdin payload is Claude Code-shaped (turn_tool_calls/cwd); another harness's hooks need a small payload adapter. Relates to [[runstophook-does-structural-citation-attribution]] and [[the-claude-code-hook-lifecycle-mapped-to-nocetta]].
