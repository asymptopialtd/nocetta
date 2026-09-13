import { relative, resolve } from "node:path";
import { loadRepoState, open } from "../facade/open.js";
import { rankedSearch } from "../retrieval/search.js";
import { appendRecall, readRecallLog } from "./log.js";
import { selectPushRecall } from "./push-recall.js";
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
  hookSpecificOutput: { hookEventName: "UserPromptSubmit"; additionalContext: string };
};

export interface UserPromptSubmitHookResult {
  /** The JSON to write to stdout, or null when nothing cleared the bar —
   * silence is the resting state (memory 9e1f9c31); emitting nothing here is
   * how a hook that runs every turn still adds zero noise most turns. */
  output: UserPromptSubmitHookOutput | null;
}

// Calibrated by sampling this project's own store (`nc.search`/`rankedSearch`
// against ~10 representative prompts — 4 genuinely on-topic, 6 generic dev
// chatter with no real match). On-topic prompts scored top-hits of 9.6-13.3;
// generic ones ("can you fix the typo in this comment", which shares "fix"
// with an unrelated decision body) still scored up to 7.5 — BM25 has no
// normalization, so a single rare shared word can look strong. 9 sits above
// every sampled false positive with room, and below every sampled true
// positive, favoring silence on the close calls. See README's push-recall
// section for the full sampled distribution.
const DEFAULT_FLOOR = 9;

function isOff(): boolean {
  return /^(1|on|true)$/i.test(process.env.NOCETTA_PUSH_OFF ?? "");
}

function floorFromEnv(): number {
  const raw = process.env.NOCETTA_PUSH_FLOOR;
  if (raw === undefined) return DEFAULT_FLOOR;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_FLOOR;
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
export function runUserPromptSubmitHook(repoRoot: string, input: UserPromptSubmitHookInput): UserPromptSubmitHookResult {
  if (isOff()) return { output: null };
  const prompt = input.prompt?.trim();
  if (!prompt) return { output: null };

  const nc = open(repoRoot);
  const nodes = nc.nodes();
  const repoState = loadRepoState(repoRoot, nodes);
  const filesInPlay = extractFilePaths(prompt, repoRoot, input.cwd ?? repoRoot);
  const candidates = rankedSearch(nodes, repoState, { filesInPlay, keyword: prompt });

  const pick = selectPushRecall(candidates, priorInjectionsFor(repoRoot, input.session_id), { floor: floorFromEnv() });
  if (!pick) return { output: null };

  appendRecall(repoRoot, {
    t: new Date().toISOString(),
    kind: "inject",
    ids: [pick.node.id],
    session: input.session_id,
    score: pick.score,
    source: pick.viaAnchor ? "anchor" : "keyword",
  });

  const summary = pick.node.summary?.trim() || pick.node.body.trim().split("\n", 1)[0] || "(no summary)";
  const additionalContext =
    `nocetta: a current belief that may relate to this — "${summary}" (id ${pick.node.id.slice(0, 8)}); ` +
    `ignore if off-topic, or memory_search to pull the detail.`;
  return { output: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } } };
}

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
export function priorInjectionsFor(repoRoot: string, sessionId: string | undefined): PriorInjection[] {
  if (!sessionId) return [];
  const events = readRecallLog(repoRoot);
  // Latest compaction that applies to this session — an exact session match,
  // or a session-less marker (the PreCompact fallback), whichever is newer.
  let resetAt = "";
  for (const e of events) {
    if (e.kind === "compaction" && (e.session === sessionId || e.session === undefined) && e.t > resetAt) resetAt = e.t;
  }
  const lastInjectById = new Map<string, { score: number; at: string; viaAnchor: boolean }>();
  for (const event of events) {
    if (event.kind !== "inject" || event.session !== sessionId) continue;
    if (resetAt && event.t <= resetAt) continue; // pre-compaction — expired
    for (const id of event.ids) {
      lastInjectById.set(id, { score: event.score ?? 0, at: event.t, viaAnchor: event.source === "anchor" });
    }
  }
  const acks = events.filter((e) => e.kind === "ack");
  return [...lastInjectById].map(([id, { score, at, viaAnchor }]) => ({
    id,
    score,
    viaAnchor,
    acked: acks.some((ack) => ack.ids.includes(id) && ack.t > at),
  }));
}

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
export function extractFilePaths(prompt: string, repoRoot: string, cwd: string): string[] {
  const out = new Set<string>();
  const matches = prompt.match(/\/?(?:[\w.@~-]+\/)+[\w.-]+\.[A-Za-z0-9]+/g) ?? [];
  for (const raw of matches.slice(0, 20)) {
    const bare = raw.replace(/:\d+(?::\d+)?$/, ""); // strip a trailing :line[:col]
    const rel = relative(repoRoot, resolve(cwd, bare)).split("\\").join("/");
    if (rel.length === 0 || rel.startsWith("..")) continue; // outside the repo
    out.add(rel);
  }
  return [...out];
}
