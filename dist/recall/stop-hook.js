import { relative, resolve } from "node:path";
import { open } from "../facade/open.js";
import { appendRecall, readRecallLog } from "./log.js";
/** The tool names whose input names a file the agent changed. */
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
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
export function runStopHook(repoRoot, input) {
    const editedFiles = editedFilesOf(input, repoRoot);
    if (editedFiles.size === 0)
        return { acked: [] };
    const surfaced = surfacedIds(repoRoot);
    if (surfaced.size === 0)
        return { acked: [] };
    const nc = open(repoRoot);
    const acked = nc
        .nodes()
        .filter((node) => surfaced.has(node.id) && node.anchors.some((a) => editedFiles.has(a.artifactPath)))
        .map((node) => node.id);
    if (acked.length > 0)
        appendRecall(repoRoot, { t: new Date().toISOString(), kind: "ack", ids: acked });
    return { acked };
}
/** The repo-relative files the turn edited, normalized to the git-style paths
 * the store's anchors use (tool_input.file_path may be absolute or cwd-relative,
 * and Windows separators are folded to forward slashes). */
function editedFilesOf(input, repoRoot) {
    const cwd = input.cwd ?? repoRoot;
    const out = new Set();
    for (const call of input.turn_tool_calls ?? []) {
        if (call.tool_name === undefined || !EDIT_TOOLS.has(call.tool_name))
            continue;
        const file = call.tool_input?.file_path;
        if (typeof file !== "string" || file.length === 0)
            continue;
        out.add(relative(repoRoot, resolve(cwd, file)).split("\\").join("/"));
    }
    return out;
}
function surfacedIds(repoRoot) {
    const ids = new Set();
    for (const event of readRecallLog(repoRoot)) {
        if (event.kind === "recall")
            for (const id of event.ids)
                ids.add(id);
    }
    return ids;
}
