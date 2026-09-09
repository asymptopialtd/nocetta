/**
 * The workflow contract, delivered in the initialize response (MCP
 * `instructions`). This is the single source of truth for how to use
 * nocetta — tool descriptions carry the mechanics; this carries the
 * when-and-why. Deliberately ~30 lines: it rides in every session's
 * context where the server connects, so it earns its place per line and
 * never restates what tools/list already says. Skills were rejected as
 * the delivery channel: loading them is model-mediated and unreliable,
 * while this arrives at handshake.
 */
export const INSTRUCTIONS = `Nocetta is anchored memory for this project: beliefs live as markdown files under .nocetta/ (committed to git) and detect their own staleness — a belief anchored to a code symbol or doc heading goes dirty when that code changes. Recall is current-only: dirty, superseded, and retired beliefs are never served as current.

The loop:
- BEFORE editing a file, call memory_search with files_in_play — memories anchored to the files you are about to touch come back ranked and current-only. Use keyword for decision-shaped questions ("why is retry capped at 3").
- AFTER finishing a task or refactor, call memory_worklist: dirty memories (the code each describes changed), cross-authority conflicts needing a supersede, and unreadable store files. Close every item — memory_repair with action "reanchor" when the belief is still true but the code moved, action "retire" (reason required) when the belief's subject is gone.
- CAPTURE with memory_remember at three moments: the user states a decision, preference, or constraint ("always…", "never…", "we do X because Y") — remember it immediately, and a user-stated directive is authority "invariant"; you make a non-obvious choice whose rationale will not survive in the diff — capture it before moving on; a task ends — before your summary, look back once at whether a future session needs anything from it. kind: "claim" = a fact about code behavior (anchor it: artifact_path + symbol_name, or heading for docs — unknown or ambiguous names are refused with the candidates; fix the name and retry), "value" = a decision and its why, "lore-fact" = a doc/plan fact, "entity" = a thing and its aliases. Give a one-line summary; shape the body as a lead sentence then **Why:**/**How to apply:**, with [[wikilinks]] to related nodes — a future recall previews the summary before spending body budget on the rest.

Store what git cannot tell the next session: decisions, rationale, behavior facts, project vocabulary — the things a future session would otherwise re-derive or violate silently. Under-capture is the expensive error: a stale memory surfaces in the worklist to be repaired, but a lost decision is gone. Skip transient task state and what a diff already shows; the write gate refuses secrets. On contradiction, supersede (memory_supersede) — never write a conflicting duplicate; history keeps the old belief and memory_as_of can revisit it.

Humans: \`nocetta ls\` browses the store; \`nocetta check --strict\` is the CI gate (exit 1 when memories need attention) — keep it green like tests.`;
