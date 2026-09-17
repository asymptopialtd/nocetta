import { createHash } from "node:crypto";
/** Path-segment separator for symbol locators (settled in PLAN.md). */
export const SEP = " › ";
/**
 * Normalized content: comments stripped, runs of whitespace collapsed to a
 * single space, trimmed. This is what gets hashed — a line-move or a
 * comment/formatting-only edit must not change the hash; a body edit must.
 */
export function normalizedSymbolText(node, source) {
    const commentRanges = [];
    (function collect(n) {
        if (n.type === "comment") {
            commentRanges.push([n.startIndex, n.endIndex]);
            return;
        }
        for (const child of n.children)
            if (child)
                collect(child);
    })(node);
    commentRanges.sort((a, b) => a[0] - b[0]);
    let out = "";
    let cursor = node.startIndex;
    for (const [start, end] of commentRanges) {
        if (start > cursor)
            out += source.slice(cursor, start);
        cursor = Math.max(cursor, end);
    }
    out += source.slice(cursor, node.endIndex);
    return out.replace(/\s+/g, " ").trim();
}
export function hashOf(text) {
    return createHash("sha256").update(text).digest("hex");
}
