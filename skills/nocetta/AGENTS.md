## Agent memory (nocetta)

This repo keeps agent memory in `.nocetta/` — plain markdown files, served by the
nocetta MCP server.

- Call `memory_search` with the files you are about to edit BEFORE editing; memories
  anchored to them surface first.
- Remember durable facts only: decisions and their why, claims about code behavior,
  entity definitions. Never transient state — if git can tell the next agent (the diff,
  the commit message, file contents), don't store it.
- Anchor claims to the exact symbol (`artifact_path` + `symbol_name`) — an unanchored fact
  can never detect its own staleness.
- When a new fact contradicts a stored one, supersede it. Never write a conflicting
  duplicate.
- After refactors, run `memory_worklist` and close every item: `memory_repair` with
  action "reanchor" when the belief still holds but the code moved, "retire" when the
  belief is gone; `memory_supersede` when the belief changed.
- CI gate: the nocetta CLI's `check --strict` fails on dirty memories, conflicts, or a
  broken store. Keep it green the way you keep tests green.
