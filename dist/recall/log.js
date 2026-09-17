import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
/**
 * The recall log: local, per-machine telemetry — the byproduct both value
 * rungs (surfaced, and surfaced-and-cited) and the future prune report read.
 * It is a sibling of the committed memory store under the same `.nocetta/`
 * root (the layout MEMORY_DIR pins), but it is never itself committed:
 * appendRecall maintains a `.nocetta/.gitignore` that excludes it, so the
 * ignore rule travels with the repo while each machine keeps its own log.
 * Committing per-recall churn would fight the pristine store and make the
 * ledger a merge battleground; a personal usage record is honestly per-machine.
 */
const NOCETTA_DIRNAME = ".nocetta";
const LOG_BASENAME = "recall-log.jsonl";
function nocettaDir(repoRoot) {
    return join(repoRoot, NOCETTA_DIRNAME);
}
export function recallLogPath(repoRoot) {
    return join(nocettaDir(repoRoot), LOG_BASENAME);
}
/**
 * Ensure `.nocetta/.gitignore` excludes the log — created or extended in
 * place, idempotently. nocetta owns `.nocetta/`, so this never touches the
 * user's root `.gitignore` (no surprise diff, no manual tax); the rule is
 * committed, so every clone ignores its own local log with zero setup.
 */
function ensureIgnored(dir) {
    const gitignore = join(dir, ".gitignore");
    const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
    if (current.split("\n").some((line) => line.trim() === LOG_BASENAME))
        return;
    const prefix = current.length > 0 && !current.endsWith("\n") ? `${current}\n` : current;
    writeFileSync(gitignore, `${prefix}${LOG_BASENAME}\n`);
}
/**
 * Append one event. Best-effort by contract: recall telemetry must never break
 * or slow the recall path, so every failure (read-only fs, a mkdir race) is
 * swallowed. An empty-id event is dropped — a search that surfaced nothing is
 * not a data point the ledger needs — except a `compaction` marker, which
 * carries no ids by design and is exactly the data point dedup-reset needs.
 */
export function appendRecall(repoRoot, event) {
    if (event.ids.length === 0 && event.kind !== "compaction")
        return;
    try {
        const dir = nocettaDir(repoRoot);
        mkdirSync(dir, { recursive: true });
        ensureIgnored(dir);
        appendFileSync(recallLogPath(repoRoot), `${JSON.stringify(event)}\n`);
    }
    catch {
        // telemetry is advisory; a write failure is never the agent's problem.
    }
}
/**
 * Read the whole log, skipping any unparseable line (a half-written tail, a
 * hand-edit) rather than throwing — the ledger is a report, not a gate.
 */
export function readRecallLog(repoRoot) {
    let raw;
    try {
        raw = readFileSync(recallLogPath(repoRoot), "utf8");
    }
    catch {
        return [];
    }
    const events = [];
    for (const line of raw.split("\n")) {
        if (line.trim().length === 0)
            continue;
        try {
            const parsed = JSON.parse(line);
            const known = parsed.kind === "recall" || parsed.kind === "ack" || parsed.kind === "inject" || parsed.kind === "compaction";
            if (known && Array.isArray(parsed.ids))
                events.push(parsed);
        }
        catch {
            // one corrupt line never sinks the rest of the log.
        }
    }
    return events;
}
