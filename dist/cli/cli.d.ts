#!/usr/bin/env node
/**
 * The human/CI half of nocetta's surface — the MCP server (Seam 5) is the
 * agent half; both are thin doors over the same facade. The point of the
 * seam is `check`: the drift gate that makes staleness actionable at PR
 * time rather than only inside an agent session. Its exit-code contract is
 * the interface CI programs against, and it is deliberately asymmetric —
 * without --strict only an unreadable store (quarantined files) fails,
 * because a repo mid-refactor drifts constantly and a casual check must not
 * cry wolf; --strict is the deliberate gate where dirty, conflicts, or
 * issues all fail. The argv parser is hand-rolled on purpose: three
 * read-only commands don't earn a dependency (light 4).
 */
export interface CliResult {
    /** Process exit code: 0 clean, 1 per the command's gate. */
    code: number;
    /** The full report, newline-terminated — the payload for stdout. */
    out: string;
}
export declare const USAGE = "nocetta \u2014 anchored, bitemporal memory (the human/CI surface)\n\nusage:\n  nocetta check [--strict] [--root <dir>]    drift report + gate: dirty nodes, conflicts, duplicates, quarantined files\n  nocetta worklist [--root <dir>]            the same report; reports, never gates (always exit 0)\n  nocetta ls [--root <dir>] [--kind <kind>]  one line per node: id8, kind, authority, first 60 chars of body\n  nocetta ledger [--root <dir>]              value ledger from the local recall log: working / redundant / dormant / prunable\n  nocetta hook stop [--root <dir>]           Claude Code Stop hook: credit memories whose file this turn edited (reads hook JSON on stdin)\n  nocetta hook user-prompt-submit [--root]   Claude Code UserPromptSubmit hook: push at most one strong, current memory as dismissible\n                                              context (reads hook JSON on stdin; NOCETTA_PUSH_FLOOR / NOCETTA_PUSH_OFF tune it \u2014 see README)\n  nocetta hook pre-compact [--root]          Claude Code PreCompact hook: mark the compaction so push-recall's per-session dedup resets\n                                              (a memory ignored before a compaction may resurface after \u2014 reads hook JSON on stdin)\n\n--strict makes check exit 1 when anything needs attention (dirty, conflicts,\nduplicates, or issues); without it only an unreadable store fails \u2014 drift is\nnormal in a moving repo, and CI passes --strict. --root defaults to discovery:\nthe nearest ancestor holding .nocetta/ or .git/, else the working directory.\n";
/**
 * The one entry point to test (main() only wires argv/stdout onto it):
 * parse, dispatch, and return the exit code plus everything stdout gets.
 * A throw from the facade — an unreadable store directory — is caught here
 * and reported as a plain failure; honest failure over a crash or,
 * worse, a silent 0 (light 5).
 */
export declare function runCli(argv: string[]): Promise<CliResult>;
/** Wires runCli onto the process: argv in, report to stdout, gate to the
 * exit code. All output goes to stdout — the report is the product, and
 * stderr would hide it from the CI log it is meant to inform. */
export declare function main(): Promise<void>;
