export type RecallEventKind = "recall" | "ack" | "inject" | "compaction";
export interface RecallEvent {
    /** ISO-8601 capture time. */
    t: string;
    kind: RecallEventKind;
    /** Node ids surfaced (recall), flagged as used by the next search (ack),
     * or pushed as context by the UserPromptSubmit hook (inject — always a
     * single id, the array shape is kept for symmetry with the other kinds).
     * Empty on `compaction`: that kind is a session marker, not an id event. */
    ids: string[];
    /** `inject`/`compaction` only: the Claude Code session this fired in — the
     * key the push-recall hook's per-session dedup (cooldown + rising bar) folds
     * the log over, and the scope a `compaction` marker resets. Absent on
     * `recall`/`ack`, and on any line written before this field existed —
     * readRecallLog must keep parsing those. */
    session?: string;
    /** `inject` only: the score the pick cleared the floor with — the rising
     * bar compares a later candidate's score against this. */
    score?: number;
    /** `inject` only: whether the pick came from an anchor match (a file the
     * prompt named) rather than a keyword hit. Dedup treats the two sources
     * differently — an anchor overrides a prior keyword suppression, so which
     * source injected a memory has to survive in the log. */
    source?: "anchor" | "keyword";
}
export declare function recallLogPath(repoRoot: string): string;
/**
 * Append one event. Best-effort by contract: recall telemetry must never break
 * or slow the recall path, so every failure (read-only fs, a mkdir race) is
 * swallowed. An empty-id event is dropped — a search that surfaced nothing is
 * not a data point the ledger needs — except a `compaction` marker, which
 * carries no ids by design and is exactly the data point dedup-reset needs.
 */
export declare function appendRecall(repoRoot: string, event: RecallEvent): void;
/**
 * Read the whole log, skipping any unparseable line (a half-written tail, a
 * hand-edit) rather than throwing — the ledger is a report, not a gate.
 */
export declare function readRecallLog(repoRoot: string): RecallEvent[];
