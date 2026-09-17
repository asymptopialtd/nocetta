/** The slice of the Claude Code PreCompact stdin payload this uses: only the
 * session, so the marker it writes is scoped to the session being compacted. */
export interface PreCompactHookInput {
    session_id?: string;
}
/**
 * PreCompact can't inject context (block/allow only, like PreToolUse), but it
 * can leave a side-effect: a `compaction` marker in the recall log. Push-recall's
 * per-session dedup reads it and stops counting injections from before the
 * marker — the "the agent already saw this" assumption that suppresses a repeat
 * expires once the context holding the injection is summarized away, so
 * re-surfacing a still-relevant memory after a compaction is help, not nagging.
 *
 * Fail-open like every telemetry hook: appendRecall swallows fs failures, and a
 * missing session_id still writes a session-less marker (a global reset — the
 * conservative fallback when we can't scope it).
 */
export declare function runPreCompactHook(repoRoot: string, input: PreCompactHookInput): void;
