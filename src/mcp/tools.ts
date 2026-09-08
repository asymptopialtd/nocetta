import { z } from "zod";
import { createNode } from "../capture/create.js";
import type { Nocetta } from "../facade/open.js";
import { shapeBelief, shapeHit, shapeLines, shapeWorklist } from "./shape.js";

const KIND = z.enum(["claim", "value", "entity", "lore-fact"]);
const AUTHORITY = z.enum(["invariant", "default"]);

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodRawShape;
  /** Synchronous by discipline: every tool is a pure function of files + repo
   * state (light 1). A thrown error reaches the agent as isError text with the
   * message verbatim — the SDK's tool handler owns that conversion. */
  run(nc: Nocetta, raw: unknown): string;
}

/**
 * The registered args are already validated against this same shape by the
 * SDK; the parse here only restores the typed view (and normalizes a client
 * that omits `arguments` entirely).
 */
function defineTool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: S,
  run: (nc: Nocetta, args: z.infer<z.ZodObject<S>>) => string,
): ToolDef {
  return {
    name,
    description,
    inputSchema,
    run: (nc, raw) => run(nc, z.object(inputSchema).parse(raw ?? {})),
  };
}

/**
 * The six-tool cap (Seam 5) lives here as data: new capability folds into an
 * existing entry before a seventh is added. Descriptions are the intuitive UX
 * — each is self-sufficient, with one example, for an agent deciding when to
 * call. Field names are snake_case, the MCP convention agents see everywhere.
 */
export const TOOLS: readonly ToolDef[] = [
  defineTool(
    "memory_search",
    "The recall surface: call it BEFORE editing code to pull up what memory knows about the files you are about to touch, or to answer a question from stored facts. " +
      "files_in_play are repo-relative paths; they match memories by their code/doc anchors. keyword is a free-text query over memory bodies. Give at least one of the two — a call with neither refuses. " +
      "Results are ranked and current-only (superseded and retired facts are never served), one JSON object per line: id, kind, authority, score, anchor locators, body. " +
      'Example: {"files_in_play":["src/auth/login.ts"]} or {"keyword":"why is retry capped at 3"}.',
    {
      files_in_play: z
        .array(z.string())
        .optional()
        .describe("Repo-relative paths you are about to edit; memories anchored to them come back first"),
      keyword: z.string().optional().describe("Free-text query over memory bodies"),
      scope: z.string().optional().describe("Restrict to one scope (a repo-relative directory, or \"global\")"),
      max_results: z.number().int().positive().optional().describe("Cap on results (default: the engine's budget)"),
    },
    (nc, { files_in_play, keyword, scope, max_results }) => {
      if ((files_in_play?.length ?? 0) === 0 && (keyword?.trim().length ?? 0) === 0) {
        throw new Error(
          "memory_search: give files_in_play (repo-relative paths you are about to edit) or keyword — with neither the only honest answer is an empty one, so the call refuses",
        );
      }
      const results = nc.search({ filesInPlay: files_in_play ?? [], keyword, scope, maxResults: max_results });
      if (results.length === 0) {
        // The teachable moment: memory was just asked and didn't know —
        // whatever the agent learns next is exactly what capture exists for.
        return "no matching memories — if you learn the answer, it is a memory_remember candidate";
      }
      return shapeLines(results.map(shapeHit));
    },
  ),

  defineTool(
    "memory_remember",
    "Capture a durable fact so a future session recalls it here. kind is \"claim\" (a fact about code), \"value\" (a decision or convention), \"entity\" (a thing and its aliases) or \"lore-fact\" (a fact about docs/plans). " +
      "A fact about code or a doc should be anchored so it detects its own staleness: pass artifact_path plus symbol_name (the exact symbol name in that file, e.g. \"foo\") or heading (the exact markdown heading). " +
      "Unknown or ambiguous anchor names are refused with the candidates — fix the name and retry; a body containing secrets is refused outright and nothing is written. " +
      "Conflict advisories come back as warnings: they are advice, the write still happened. " +
      'Example: {"body":"foo returns the number one","kind":"claim","artifact_path":"src/foo.ts","symbol":"foo"}.',
    {
      body: z.string().min(1).describe("The fact itself, in prose"),
      kind: KIND.describe("claim = fact about code, value = decision/convention, entity = thing + aliases, lore-fact = doc/plan fact"),
      artifact_path: z.string().optional().describe("Repo-relative path of the file to anchor to (required with symbol or heading)"),
      symbol_name: z.string().optional().describe("Exact symbol name in artifact_path to anchor to (code files)"),
      heading: z.string().optional().describe("Exact markdown heading in artifact_path to anchor to"),
      scope: z.string().optional().describe("Scope, e.g. a repo-relative directory (default: \"global\")"),
      authority: AUTHORITY.optional().describe('"invariant" = a directive the user stated or a convention that must outrank contradicting defaults; your own conclusions stay "default" (default: "default")'),
      supersedes: z.string().optional().describe("Node id this fact replaces, in one call (capture-as-supersession)"),
    },
    (nc, { body, kind, artifact_path, symbol_name, heading, scope, authority, supersedes }) => {
      const { node, superseded, warnings } = nc.remember({
        body,
        kind,
        artifactPath: artifact_path,
        symbolName: symbol_name,
        heading,
        scope,
        authority,
        supersedes,
      });
      return JSON.stringify({
        id: node.id,
        anchor: node.anchors.map((a) => a.locator),
        scope: node.scope,
        ...(superseded ? { superseded: superseded.id } : {}),
        warnings,
      });
    },
  ),

  defineTool(
    "memory_supersede",
    "Correct a belief: writes a new node that supersedes old_id — the old node is never deleted, it stays in history, and recall resolves to the new one. " +
      "Find the id with memory_search first. kind defaults to the old node's kind. " +
      'Example: {"old_id":"<id from memory_search>","body":"foo now returns 42"}.',
    {
      old_id: z.string().describe("The node being corrected"),
      body: z.string().min(1).describe("The corrected fact, in prose"),
      kind: KIND.optional().describe("Defaults to the old node's kind"),
      restates: z.string().optional().describe("Node id this correction returns to (walk-back provenance, when the new belief revives an older one)"),
    },
    (nc, { old_id, body, kind, restates }) => {
      const old = nc.nodes().find((n) => n.id === old_id);
      if (old === undefined) {
        throw new Error(`memory_supersede: unknown node "${old_id}" — find ids with memory_search first`);
      }
      // The tip inherits the old belief's anchors, scope and authority: a
      // correction is about the same subject — only the body moved.
      const next = createNode({
        body,
        kind: kind ?? old.kind,
        scope: old.scope,
        authority: old.authority,
        anchors: old.anchors,
      });
      const result = nc.supersede(old_id, next, { restates });
      return JSON.stringify({ superseded: result.old.id, validTo: result.old.validTo, tip: result.next.id });
    },
  ),

  defineTool(
    "memory_worklist",
    "What needs attention: dirty nodes (the code each is anchored to changed since capture — listed with the reason verbatim and the artifactPath to repair against), cross-authority conflicts that need a supersede, and quarantined store files. " +
      "Run it after edits or refactors, and before trusting recall. Dirty nodes are repaired via memory_repair (action \"reanchor\"), or retired there if the belief is simply gone. Example: {}.",
    {},
    (nc) => shapeWorklist(nc.worklist(), nc.issues()),
  ),

  defineTool(
    "memory_repair",
    "Close an item from memory_worklist. action \"reanchor\": the dirty node's anchor is re-resolved against the artifact's current source and its locator+hash rewritten — the belief itself is untouched; give symbol_name (the exact symbol name) or heading (the exact heading), the same names memory_remember accepts. " +
      "action \"retire\": the belief's subject is gone; closes the node's validity window and requires reason. " +
      'Example: {"node_id":"<id from memory_worklist>","action":"reanchor","symbol":"foo"}.',
    {
      node_id: z.string().describe("The node to repair"),
      action: z.enum(["reanchor", "retire"]).describe('"reanchor" fixes a drifted anchor in place; "retire" closes a belief whose subject is gone'),
      symbol_name: z.string().optional().describe("Exact symbol name to re-resolve the anchor against (reanchor on code)"),
      heading: z.string().optional().describe("Exact markdown heading to re-resolve the anchor against (reanchor on docs)"),
      reason: z.string().optional().describe("Why the belief is gone (required for retire)"),
    },
    (nc, { node_id, action, symbol_name, heading, reason }) => {
      if (action === "reanchor") {
        // Validation is the engine's single voice: reAnchor refuses a request
        // that names nothing with the same message capture would give.
        const repaired = nc.reAnchor(node_id, { symbolName: symbol_name, heading });
        return JSON.stringify({ id: repaired.id, anchor: repaired.anchors.map((a) => a.locator) });
      }
      // An absent reason trips retire's own refusal, verbatim.
      const retired = nc.retire(node_id, reason ?? "");
      return JSON.stringify({ id: retired.id, validTo: retired.validTo, retiredReason: retired.retiredReason });
    },
  ),

  defineTool(
    "memory_as_of",
    "Time travel: the beliefs the store held at transaction time at (ISO 8601) — including facts that have since been superseded or retired. " +
      'Use it to answer "what did we believe back then?": reproducing an old bug, auditing how a decision evolved. One JSON object per line, shaped like memory_search results but unranked and carrying the validity window. ' +
      'Example: {"at":"2026-06-01T00:00:00Z"}.',
    {
      at: z.string().describe("ISO 8601 transaction time to query the store at"),
    },
    (nc, { at }) => {
      const nodes = nc.asOf(at);
      return nodes.length === 0 ? `the store held no beliefs at ${at}` : shapeLines(nodes.map(shapeBelief));
    },
  ),
];
