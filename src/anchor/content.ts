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

/**
 * Second locator strategy (per PLAN.md): for non-code content artifacts
 * (prose/markdown), a symbol is a Markdown heading span — heading text plus
 * the (whitespace-normalized) body until the next heading of any level.
 * Content above/between unrelated sections moving around never touches a
 * given span's own hash, mirroring the line-move-doesn't-dirty property
 * from the code locator (Slice 1).
 */
export function extractContentSpans(filePath: string, source: string): ContentSpan[] {
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
