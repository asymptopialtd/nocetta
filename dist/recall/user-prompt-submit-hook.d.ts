import type { PriorInjection } from "./push-recall.js";
/** The slice of the Claude Code UserPromptSubmit stdin payload this uses.
 * `prompt` is the text the hook searches on; `session_id` is the key the
 * per-session dedup (selectPushRecall's rising bar / used-suppression) folds
 * the recall log over; `cwd` normalizes any file paths named in the prompt to
 * the repo-relative form the store's anchors use. */
export interface UserPromptSubmitHookInput {
    prompt?: string;
    session_id?: string;
    cwd?: string;
}
export type UserPromptSubmitHookOutput = {
    hookSpecificOutput: {
        hookEventName: "UserPromptSubmit";
        additionalContext: string;
    };
};
export interface UserPromptSubmitHookResult {
    /** The JSON to write to stdout, or null when nothing cleared the bar —
     * silence is the resting state (memory 9e1f9c31); emitting nothing here is
     * how a hook that runs every turn still adds zero noise most turns. */
    output: UserPromptSubmitHookOutput | null;
}
/**
 * The push half of rung 2: unlike the Stop hook (citation-only, never
 * injects), this one deliberately does — but at most one node, only above
 * NOCETTA_PUSH_FLOOR, framed as dismissible background the agent may ignore.
 * See push-recall.ts for the selection guardrails; this function is the I/O
 * shell around it — read the prompt, run the ranked pipeline, fold this
 * session's own inject/ack history from the log, and log what fires.
 *
 * NOCETTA_PUSH_OFF is the kill switch (matches the project's other env-knob
 * conventions, e.g. NOCETTA_ROOT): fail-open, no-op, same as bad/absent stdin.
 */
export declare function runUserPromptSubmitHook(repoRoot: string, input: UserPromptSubmitHookInput): UserPromptSubmitHookResult;
/**
 * This session's own inject history, each id's last injected score, source,
 * and whether it was later acked. Ack events aren't session-tagged (RecallEvent
 * only carries `session` on `inject`/`compaction`), so "acked" is a time-ordered
 * proxy — any ack for the id after its inject — the same looseness the Stop
 * hook's surfaced-set already accepts; it is not exact cross-session isolation.
 *
 * Compaction-reset: injections from before this session's latest `compaction`
 * marker (written by the PreCompact hook) no longer count — the context that
 * held them was summarized away, so "the agent already saw this" no longer
 * holds and re-surfacing a still-relevant memory is help, not nagging.
 */
export declare function priorInjectionsFor(repoRoot: string, sessionId: string | undefined): PriorInjection[];
/**
 * Repo-relative file paths named in the prompt, so a memory anchored to a file
 * the user is talking *about* can surface even before any edit — this is what
 * makes selectPushRecall's anchor path reachable through the live hook.
 *
 * Deliberately conservative: it matches only path-shaped tokens (a slash and a
 * dotted filename, an optional leading slash for absolute paths), normalizes
 * each into the repo, and drops anything that escapes it. A path that matches
 * nothing is harmless (candidatesFromFiles just finds no anchor for it); the
 * risk to avoid is a prose word that looks like a path and hits an anchor, so
 * bare filenames (no slash) are intentionally not matched — an anchor path is
 * always a full repo-relative path, so a bare name would never match one anyway.
 */
export declare function extractFilePaths(prompt: string, repoRoot: string, cwd: string): string[];
