import { loadRepoState, open } from "../facade/open.js";
import { rankedSearch } from "../retrieval/search.js";
import { appendRecall, readRecallLog } from "./log.js";
import { selectPushRecall } from "./push-recall.js";
import type { PriorInjection } from "./push-recall.js";

/** The slice of the Claude Code UserPromptSubmit stdin payload this uses.
 * `prompt` is the text the hook searches on; `session_id` is the key the
 * per-session dedup (selectPushRecall's rising bar / used-suppression) folds
 * the recall log over. */
export interface UserPromptSubmitHookInput {
  prompt?: string;
  session_id?: string;
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
  const candidates = rankedSearch(nodes, repoState, { filesInPlay: [], keyword: prompt });

  const pick = selectPushRecall(candidates, priorInjectionsFor(repoRoot, input.session_id), { floor: floorFromEnv() });
  if (!pick) return { output: null };

  appendRecall(repoRoot, {
    t: new Date().toISOString(),
    kind: "inject",
    ids: [pick.node.id],
    session: input.session_id,
    score: pick.score,
  });

  const summary = pick.node.summary?.trim() || pick.node.body.trim().split("\n", 1)[0] || "(no summary)";
  const additionalContext =
    `nocetta: a current belief that may relate to this — "${summary}" (id ${pick.node.id.slice(0, 8)}); ` +
    `ignore if off-topic, or memory_search to pull the detail.`;
  return { output: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } } };
}

/**
 * This session's own inject history, each id's last injected score plus
 * whether it was later acked. Ack events aren't session-tagged (RecallEvent
 * only carries `session` on `inject`), so "acked" is a time-ordered proxy —
 * any ack for the id after its inject — the same looseness the Stop hook's
 * surfaced-set already accepts; it is not exact cross-session isolation.
 *
 * TODO(compaction-reset): once a PreCompact-driven marker exists in the log,
 * this is where it would filter — inject history from before the marker
 * should stop counting toward the dedup, since the "the agent already saw
 * this" assumption expires once the context holding it is compacted away.
 * Not built here; this function is the seam it would hook into.
 */
function priorInjectionsFor(repoRoot: string, sessionId: string | undefined): PriorInjection[] {
  if (!sessionId) return [];
  const events = readRecallLog(repoRoot);
  const lastInjectById = new Map<string, { score: number; at: string }>();
  for (const event of events) {
    if (event.kind !== "inject" || event.session !== sessionId) continue;
    for (const id of event.ids) lastInjectById.set(id, { score: event.score ?? 0, at: event.t });
  }
  const acks = events.filter((e) => e.kind === "ack");
  return [...lastInjectById].map(([id, { score, at }]) => ({
    id,
    score,
    acked: acks.some((ack) => ack.ids.includes(id) && ack.t > at),
  }));
}
