/** The slice of the Claude Code Stop-hook stdin payload this uses. Everything
 * else in the payload is ignored — this reads only what the agent edited. */
export interface StopHookInput {
    turn_tool_calls?: Array<{
        tool_name?: string;
        tool_input?: Record<string, unknown>;
    }>;
    cwd?: string;
}
export interface StopHookResult {
    /** Memory ids credited as used this turn — the ack event's ids, [] if none. */
    acked: string[];
}
/**
 * The citation half of rung 2, as a Stop hook: attribute *use* structurally,
 * never by fuzzy text. A memory that was surfaced by some recall (from the log)
 * AND is anchored to a file the agent edited this turn was, by nocetta's own
 * anchor semantics, load-bearing for that edit — so record an `ack`.
 *
 * Why structural, not text-matching: an answer that merely shares vocabulary
 * with a memory is not evidence it was used, and a false "cited" is exactly the
 * noise that kills trust (noise is a product killer). The surfaced ∩
 * edited-its-anchored-file signal needs no text inference, no agent burden, and
 * it closes the last-recall gap used_ids leaves (the final recall of a turn has
 * no next search to acknowledge it). Citation-only by design: it records, it
 * never injects a nudge — so a Stop hook that fires every turn adds no noise to
 * the agent's context.
 */
export declare function runStopHook(repoRoot: string, input: StopHookInput): StopHookResult;
