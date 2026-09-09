import { createHash } from "node:crypto";
import type { Anchor, LocateResult } from "./types.js";

export interface ContentSpan {
  /** e.g. "lore/mage.md#Elminster" */
  path: string;
  heading: string;
  hash: string;
  startLine: number;
  endLine: number;
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const HEADING = /^#{1,6}\s+(.*)$/;

function extractHeadingSpans(filePath: string, source: string): ContentSpan[] {
  const lines = source.split("\n");
  const spans: ContentSpan[] = [];
  let heading: string | null = null;
  let startLine = 0;
  let bodyLines: string[] = [];

  const flush = (endLine: number): void => {
    if (heading === null) return;
    const text = bodyLines.join("\n").replace(/\s+/g, " ").trim();
    spans.push({ path: `${filePath}#${heading}`, heading, hash: hashOf(text), startLine, endLine });
  };

  lines.forEach((line, i) => {
    const match = HEADING.exec(line);
    if (match) {
      flush(i - 1);
      heading = match[1]!.trim();
      startLine = i;
      bodyLines = [];
    } else if (heading !== null) {
      bodyLines.push(line);
    }
  });
  flush(lines.length - 1);
  return spans;
}

const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const SEPARATOR_CELL = /^:?-+:?$/;

function splitRow(line: string): string[] {
  const match = TABLE_ROW.exec(line);
  return match ? match[1]!.split("|").map((cell) => cell.trim()) : [];
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

/**
 * Table-row anchors (additive to heading spans, same "content" strategy —
 * never a fork per the extension registry, memory 2285e74d): a Markdown
 * table's data rows are landed-fact records with a stable id in their first
 * cell (e.g. `| GAP·stream | ... |`), so each row becomes its own span keyed
 * by that first cell — reusing the exact same `heading`-named-candidate
 * machinery a real heading uses (requireSingleMatch, locateContent's
 * exact/fallback lookup) rather than a parallel code path. A header row
 * (immediately followed by a `---`-cell separator row) is never itself a
 * span; only the data rows beneath it are. The hash covers only that row's
 * own (whitespace-collapsed) text, so reordering or editing unrelated rows
 * never dirties it — the same isolation heading spans give each section.
 */
function extractTableRowSpans(filePath: string, source: string): ContentSpan[] {
  const lines = source.split("\n");
  const spans: ContentSpan[] = [];
  let i = 0;
  while (i < lines.length) {
    const headerCells = splitRow(lines[i] ?? "");
    const sepCells = splitRow(lines[i + 1] ?? "");
    if (headerCells.length === 0 || !isSeparatorRow(sepCells)) {
      i++;
      continue;
    }
    i += 2; // past the header row and its separator
    while (i < lines.length) {
      const cells = splitRow(lines[i] ?? "");
      if (cells.length === 0) break; // the table ends at the first non-row line
      const rowId = cells[0];
      if (rowId) {
        const text = lines[i]!.replace(/\s+/g, " ").trim();
        spans.push({ path: `${filePath}#${rowId}`, heading: rowId, hash: hashOf(text), startLine: i, endLine: i });
      }
      i++;
    }
  }
  return spans;
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
export function extractContentSpans(filePath: string, source: string): ContentSpan[] {
  return [...extractHeadingSpans(filePath, source), ...extractTableRowSpans(filePath, source)];
}

/** Relocate a content-artifact anchor, mirroring anchor/locate.ts's
 * exact-path-first / same-name-unchanged-hash-fallback strategy. */
export function locateContent(anchor: Anchor, sourceAfter: string): LocateResult {
  const spans = extractContentSpans(anchor.artifactPath, sourceAfter);

  const exact = spans.find((s) => s.path === anchor.locator);
  if (exact) {
    return { found: true, hashChanged: exact.hash !== anchor.hash, symbol: toSymbolInfo(exact) };
  }

  const heading = anchor.locator.split("#").pop();
  const candidates = spans.filter((s) => s.heading === heading && s.hash === anchor.hash);
  if (candidates.length === 1) {
    return { found: true, hashChanged: false, symbol: toSymbolInfo(candidates[0]!) };
  }

  return { found: false, hashChanged: false };
}

function toSymbolInfo(span: ContentSpan): LocateResult["symbol"] {
  return {
    path: span.path,
    kind: "content-span",
    name: span.heading,
    hash: span.hash,
    startIndex: 0,
    endIndex: 0,
    startPosition: { row: span.startLine, column: 0 },
    endPosition: { row: span.endLine, column: 0 },
  };
}
