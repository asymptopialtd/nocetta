#!/usr/bin/env node
import { resolveRoot } from "../facade/root.js";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { open } from "../facade/open.js";
import type { Nocetta, Worklist } from "../facade/open.js";
import { filenameFor } from "../store/store.js";
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
  nocetta check [--strict] [--root <dir>]    drift report + gate: dirty nodes, conflicts, quarantined files
  nocetta worklist [--root <dir>]            the same report; reports, never gates (always exit 0)
  nocetta ls [--root <dir>] [--kind <kind>]  one line per node: id8, kind, authority, first 60 chars of body

--strict makes check exit 1 when anything needs attention (dirty, conflicts,
or issues); without it only an unreadable store fails — drift is normal in a
moving repo, and CI passes --strict. --root defaults to discovery: the nearest
ancestor holding .nocetta/ or .git/, else the working directory.
`;

const COMMANDS = ["check", "worklist", "ls"] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

interface ParsedArgs {
  command: Command | null;
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
  const parsed: ParsedArgs = { command: null, strict: false, root: null, kind: null, help: false, problem: null };
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
    return lsCommand(root, args.kind);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, out: `nocetta: ${message}\n` };
  }
}

function checkCommand(root: string, strict: boolean): CliResult {
  const report = survey(open(root));
  const unhealthy = report.dirty.length > 0 || report.conflicts.length > 0 || report.issues.length > 0;
  // The gate's asymmetry is the contract: issues (an unreadable store) fail
  // in both modes — an agent serving from a quarantined store is on sand —
  // while drift and conflicts fail only under --strict, CI's explicit
  // "make staleness break the build" mode.
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
 * dirty+conflicts, the quarantine report, and the node total for the summary. */
interface Report extends Worklist {
  nodeCount: number;
  issues: StoreIssue[];
}

function survey(nc: Nocetta): Report {
  const worklist = nc.worklist();
  return { nodeCount: nc.nodes().length, dirty: worklist.dirty, conflicts: worklist.conflicts, issues: nc.issues() };
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
  if (report.issues.length > 0) {
    lines.push(`issues (${report.issues.length}):`);
    for (const issue of report.issues) lines.push(`  ${issue.file}  ${issue.reason}`);
  }
  lines.push(
    `${report.nodeCount} nodes · ${report.dirty.length} dirty · ${report.conflicts.length} conflicts · ${report.issues.length} issues`,
  );
  return `${lines.join("\n")}\n`;
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
