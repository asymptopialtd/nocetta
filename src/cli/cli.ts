#!/usr/bin/env node
import { resolveRoot } from "../facade/root.js";
import { resolve } from "node:path";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { open } from "../facade/open.js";
import type { Nocetta, Worklist } from "../facade/open.js";
import { buildLedger, classify, readRecallLog, runStopHook, runUserPromptSubmitHook, runPreCompactHook } from "../recall/index.js";
import type { Ledger, LedgerEntry, StopHookInput, UserPromptSubmitHookInput, PreCompactHookInput } from "../recall/index.js";
import { filenameFor } from "../store/store.js";
import { isCurrent } from "../store/index-file.js";
import type { StoreIssue } from "../store/store.js";
import type { MemoryNode } from "../store/types.js";

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

export const USAGE = `nocetta — anchored, bitemporal memory (the human/CI surface)

usage:
  nocetta check [--strict] [--root <dir>]    drift report + gate: dirty nodes, conflicts, duplicates, quarantined files
  nocetta worklist [--root <dir>]            the same report; reports, never gates (always exit 0)
  nocetta ls [--root <dir>] [--kind <kind>]  one line per node: id8, kind, authority, first 60 chars of body
  nocetta ledger [--root <dir>]              value ledger from the local recall log: working / redundant / dormant / prunable
  nocetta hook stop [--root <dir>]           Claude Code Stop hook: credit memories whose file this turn edited (reads hook JSON on stdin)
  nocetta hook user-prompt-submit [--root]   Claude Code UserPromptSubmit hook: push at most one strong, current memory as dismissible
                                              context (reads hook JSON on stdin; NOCETTA_PUSH_FLOOR / NOCETTA_PUSH_OFF tune it — see README)
  nocetta hook pre-compact [--root]          Claude Code PreCompact hook: mark the compaction so push-recall's per-session dedup resets
                                              (a memory ignored before a compaction may resurface after — reads hook JSON on stdin)

--strict makes check exit 1 when anything needs attention (dirty, conflicts,
duplicates, or issues); without it only an unreadable store fails — drift is
normal in a moving repo, and CI passes --strict. --root defaults to discovery:
the nearest ancestor holding .nocetta/ or .git/, else the working directory.
`;

const COMMANDS = ["check", "worklist", "ls", "ledger", "hook"] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

interface ParsedArgs {
  command: Command | null;
  /** The second bare token, taken only after `hook` (its event name, e.g.
   * "stop"). Every other command takes no operand, so a second token there is
   * a parse problem. */
  sub: string | null;
  strict: boolean;
  root: string | null;
  kind: string | null;
  help: boolean;
  /** First parse problem found — unknown option, a flag missing its value,
   * an unexpected extra argument. Null when the argv is well-formed. */
  problem: string | null;
}

/**
 * Flags may appear before or after the command; the first bare token is the
 * command and any second one is a parse problem (no command takes operands).
 */
function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: null, sub: null, strict: false, root: null, kind: null, help: false, problem: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--strict") {
      parsed.strict = true;
    } else if (arg === "--root" || arg === "--kind") {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ...parsed, problem: `option ${arg} needs a value` };
      }
      if (arg === "--root") parsed.root = value;
      else parsed.kind = value;
      i++;
    } else if (arg.startsWith("-") && arg !== "-") {
      return { ...parsed, problem: `unknown option: ${arg}` };
    } else if (parsed.command === null) {
      if (!isCommand(arg)) return { ...parsed, problem: `unknown command: ${arg}` };
      parsed.command = arg;
    } else if (parsed.command === "hook" && parsed.sub === null) {
      parsed.sub = arg;
    } else {
      return { ...parsed, problem: `unexpected argument: ${arg}` };
    }
  }
  return parsed;
}

/**
 * The one entry point to test (main() only wires argv/stdout onto it):
 * parse, dispatch, and return the exit code plus everything stdout gets.
 * A throw from the facade — an unreadable store directory — is caught here
 * and reported as a plain failure; honest failure over a crash or,
 * worse, a silent 0 (light 5).
 */
export async function runCli(argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv);
  if (args.help) return { code: 0, out: USAGE };
  if (args.problem !== null) return { code: 1, out: `${args.problem}\n\n${USAGE}` };
  if (args.command === null) return { code: 1, out: `no command given\n\n${USAGE}` };

  // The repo root is a deployment decision, ambient like the MCP server's.
  const root = resolveRoot({ explicit: args.root ?? undefined });
  try {
    if (args.command === "check") return checkCommand(root, args.strict);
    if (args.command === "worklist") return worklistCommand(root);
    if (args.command === "ledger") return ledgerCommand(root);
    if (args.command === "hook") return hookCommand(root, args.sub);
    return lsCommand(root, args.kind);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, out: `nocetta: ${message}\n` };
  }
}

function checkCommand(root: string, strict: boolean): CliResult {
  const report = survey(open(root));
  const unhealthy =
    report.dirty.length > 0 || report.conflicts.length > 0 || report.duplicates.length > 0 || report.issues.length > 0;
  // The gate's asymmetry is the contract: issues (an unreadable store) fail
  // in both modes — an agent serving from a quarantined store is on sand —
  // while drift, conflicts, and duplicates fail only under --strict, CI's
  // explicit "make staleness break the build" mode.
  const code = report.issues.length > 0 || (strict && unhealthy) ? 1 : 0;
  return { code, out: render(report) };
}

function worklistCommand(root: string): CliResult {
  // No gate here by design: the worklist reports what needs attention and
  // leaves the verdict to whoever asked. Only the runCli-level catch (store
  // unreadable) can produce a nonzero code.
  return { code: 0, out: render(survey(open(root))) };
}

function lsCommand(root: string, kind: string | null): CliResult {
  const nodes = open(root).nodes();
  const selected = kind === null ? nodes : nodes.filter((node) => node.kind === kind);
  const sorted = [...selected].sort((a, b) => a.id.localeCompare(b.id));
  const rows = sorted.map((node) => ({
    id: id8(node),
    kind: node.kind,
    authority: node.authority,
    body: bodyHead(node.body),
  }));
  // Pad from the rows actually printed: a filtered ls keeps its columns
  // flush without reserving width for kinds that aren't on the page.
  const kindWidth = Math.max(0, ...rows.map((row) => row.kind.length));
  const authorityWidth = Math.max(0, ...rows.map((row) => row.authority.length));
  const lines = rows.map(
    (row) => `${row.id}  ${row.kind.padEnd(kindWidth)}  ${row.authority.padEnd(authorityWidth)}  ${row.body}`,
  );
  return { code: 0, out: lines.length > 0 ? `${lines.join("\n")}\n` : "" };
}

/** Everything the check/worklist report needs, gathered once: the worklist's
 * dirty+conflicts+duplicates, the quarantine report, and the node total for
 * the summary. */
interface Report extends Worklist {
  nodeCount: number;
  issues: StoreIssue[];
}

function survey(nc: Nocetta): Report {
  const worklist = nc.worklist();
  return { nodeCount: nc.nodes().length, dirty: worklist.dirty, conflicts: worklist.conflicts, duplicates: worklist.duplicates, issues: nc.issues() };
}

/** The display id — the same 8 chars the filename slug carries, so a report
 * line and its file are recognizably the same node. */
function id8(node: MemoryNode): string {
  return node.id.slice(0, 8);
}

const BODY_HEAD_CHARS = 60;

/** One line per node means prose on one line: whitespace (bodies wrap)
 * collapses, then the first 60 chars — a label, not the document. */
function bodyHead(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, BODY_HEAD_CHARS);
}

/**
 * The one report both gate and no-gate commands print. Sections appear only
 * when they have something to say; the summary line always does, so a clean
 * run is exactly one line. The dirty line carries the node's filename slug
 * — the human can open (or `git log --`) the exact file without resolving
 * id → path themselves.
 */
function render(report: Report): string {
  const lines: string[] = [];
  if (report.dirty.length > 0) {
    lines.push(`dirty (${report.dirty.length}):`);
    for (const { node, reason } of report.dirty) {
      lines.push(`  ${id8(node)}  ${reason}  (file: ${filenameFor(node)})`);
    }
  }
  if (report.conflicts.length > 0) {
    lines.push(`conflicts (${report.conflicts.length}):`);
    for (const conflict of report.conflicts) {
      lines.push(`  ${conflict.subject}`);
      lines.push(`    invariant  ${id8(conflict.invariantNode)}  ${bodyHead(conflict.invariantNode.body)}`);
      lines.push(`    default    ${id8(conflict.defaultNode)}  ${bodyHead(conflict.defaultNode.body)}`);
    }
  }
  if (report.duplicates.length > 0) {
    lines.push(`duplicates (${report.duplicates.length}):`);
    for (const duplicate of report.duplicates) {
      lines.push(`  ${Math.round(duplicate.score * 100)}%  ${id8(duplicate.a)}  ${bodyHead(duplicate.a.body)}`);
      lines.push(`        ${id8(duplicate.b)}  ${bodyHead(duplicate.b.body)}`);
    }
  }
  if (report.issues.length > 0) {
    lines.push(`issues (${report.issues.length}):`);
    for (const issue of report.issues) lines.push(`  ${issue.file}  ${issue.reason}`);
  }
  lines.push(
    `${report.nodeCount} nodes · ${report.dirty.length} dirty · ${report.conflicts.length} conflicts · ${report.duplicates.length} dups · ${report.issues.length} issues`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * The value ledger: the local recall log folded over the current store into
 * the surfaced × complement 2×2. A report, never a gate (exit 0 always) — it
 * exists to make the payout visible, the counterweight to the worklist's warts.
 * Deliberately CLI-only and off the six-tool MCP surface: it is management, run
 * on purpose by a human, not something the agent reaches for mid-task.
 */
function ledgerCommand(root: string): CliResult {
  const nc = open(root);
  const now = new Date().toISOString();
  const current = nc.nodes().filter((node) => isCurrent(node, now));
  const events = readRecallLog(root);
  const readArtifact = (path: string): string | undefined => {
    try {
      return readFileSync(resolve(root, path), "utf8");
    } catch {
      return undefined;
    }
  };
  const ledger = buildLedger(current, events, (node) => classify(node, readArtifact));
  return { code: 0, out: renderLedger(ledger, events.length) };
}

function renderLedger(ledger: Ledger, eventCount: number): string {
  const lines = [`value ledger  (${eventCount} recall event${eventCount === 1 ? "" : "s"})`, ""];
  const section = (entries: LedgerEntry[], title: string): void => {
    lines.push(`${title} (${entries.length}):`);
    for (const entry of entries) {
      const surfaced = entry.surfaced > 0 ? `${entry.surfaced}×` : "—";
      const cited = entry.cited > 0 ? `cited ${entry.cited}×` : "";
      lines.push(`  ${entry.id.slice(0, 8)}  ${surfaced.padEnd(4)} ${cited.padEnd(9)} ${entry.summary}`);
    }
    lines.push("");
  };
  section(ledger.working, "working — surfaced, beyond the code");
  section(ledger.redundant, "redundant — surfaced, code already covers it");
  section(ledger.dormant, "dormant — never surfaced, beyond the code (latent insurance, keep)");
  section(ledger.prunable, "prunable — never surfaced and code already covers it");
  lines.push(
    `${ledger.working.length} working · ${ledger.redundant.length} redundant · ${ledger.dormant.length} dormant · ${ledger.prunable.length} prunable`,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * The hook door: a Claude Code hook calls `nocetta hook <event>`, hands the
 * event JSON on stdin, and reads nothing back (these hooks are side-effects on
 * the recall log, never context the model sees — citation-only, so a hook that
 * fires every turn adds no noise). Bad or absent stdin degrades to a no-op
 * rather than an error: a telemetry hook must never fail the turn it rides.
 */
function hookCommand(root: string, sub: string | null): CliResult {
  if (sub === "stop") {
    let input: StopHookInput = {};
    try {
      input = JSON.parse(readFileSync(0, "utf8")) as StopHookInput;
    } catch {
      // no piped stdin, or malformed payload: nothing to attribute, exit clean.
    }
    runStopHook(root, input);
    return { code: 0, out: "" };
  }
  if (sub === "user-prompt-submit") {
    let input: UserPromptSubmitHookInput = {};
    try {
      input = JSON.parse(readFileSync(0, "utf8")) as UserPromptSubmitHookInput;
    } catch {
      // no piped stdin, or malformed payload: nothing to push, exit clean.
    }
    // Unlike the Stop hook, this one has a JSON payload to print — only when
    // it actually injects (rule: default to silence). stdout stays empty on
    // every other turn, same contract as Stop.
    const { output } = runUserPromptSubmitHook(root, input);
    return { code: 0, out: output ? JSON.stringify(output) : "" };
  }
  if (sub === "pre-compact") {
    let input: PreCompactHookInput = {};
    try {
      input = JSON.parse(readFileSync(0, "utf8")) as PreCompactHookInput;
    } catch {
      // no piped stdin, or malformed payload: mark the compaction session-less.
    }
    // Side-effect only (PreCompact can't inject): drop a marker that resets
    // this session's push-recall dedup window. Empty stdout, same as Stop.
    runPreCompactHook(root, input);
    return { code: 0, out: "" };
  }
  return { code: 1, out: `nocetta hook: unknown hook "${sub ?? ""}" — supported: stop, user-prompt-submit, pre-compact\n` };
}

/** Wires runCli onto the process: argv in, report to stdout, gate to the
 * exit code. All output goes to stdout — the report is the product, and
 * stderr would hide it from the CI log it is meant to inform. */
export async function main(): Promise<void> {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.out);
  process.exitCode = result.code;
}

// Entrypoint-and-module guard: argv[1] realpath'd through pathToFileURL so
// URL-encoding (spaces, non-ASCII), Windows drive letters, and package-manager
// bin symlinks (pnpm installs node_modules/<pkg> as a symlink; argv[1] keeps
// the link path while import.meta.url resolves the target) all compare equal
// to import.meta.url. A silently-false guard means `npx nocetta` exits 0
// printing nothing — worse than a crash.
function isEntrypoint(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  });
}
