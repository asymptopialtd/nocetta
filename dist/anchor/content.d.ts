import type { Anchor, LocateResult } from "./types.js";
export interface ContentSpan {
    /** e.g. "lore/mage.md#Elminster" */
    path: string;
    heading: string;
    hash: string;
    startLine: number;
    endLine: number;
}
/**
 * Second locator strategy (per PLAN.md): for non-code content artifacts
 * (prose/markdown), a symbol is a Markdown heading span — heading text plus
 * the (whitespace-normalized) body until the next heading of any level —
 * or a table-row span (see extractTableRowSpans), additive to headings.
 * Content above/between unrelated sections moving around never touches a
 * given span's own hash, mirroring the line-move-doesn't-dirty property
 * from the code locator (Slice 1).
 */
export declare function extractContentSpans(filePath: string, source: string): ContentSpan[];
/** Relocate a content-artifact anchor, mirroring anchor/locate.ts's
 * exact-path-first / same-name-unchanged-hash-fallback strategy. */
export declare function locateContent(anchor: Anchor, sourceAfter: string): LocateResult;
