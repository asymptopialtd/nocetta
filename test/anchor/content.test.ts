import { describe, expect, it } from "vitest";
import { extractContentSpans, locateAnchor, locateContent } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";

const FILE = "lore/mage.md";

const before = `# Overview

Some intro text.

# Elminster

Elminster is a powerful archmage who lives in Shadowdale.

# Mystra

Mystra is the goddess of magic.
`;

function anchorFor(source: string, heading: string): Anchor {
  const span = extractContentSpans(FILE, source).find((s) => s.heading === heading);
  if (!span) throw new Error(`fixture bug: no heading ${heading}`);
  return { locator: span.path, hash: span.hash, artifactPath: FILE };
}

describe("extractContentSpans", () => {
  it("splits a markdown file into heading-delimited spans", () => {
    const spans = extractContentSpans(FILE, before);
    expect(spans.map((s) => s.heading)).toEqual(["Overview", "Elminster", "Mystra"]);
    expect(spans.map((s) => s.path)).toEqual([`${FILE}#Overview`, `${FILE}#Elminster`, `${FILE}#Mystra`]);
  });
});

const withTable = `# Facts

| id | status |
| --- | --- |
| GAP·stream | open |
| GAP·batch | closed |

# Notes

Nothing here is a table row.
`;

function rowAnchorFor(source: string, rowId: string): Anchor {
  const span = extractContentSpans(FILE, source).find((s) => s.heading === rowId);
  if (!span) throw new Error(`fixture bug: no row ${rowId}`);
  return { locator: span.path, hash: span.hash, artifactPath: FILE };
}

describe("extractContentSpans — table-row anchors (additive to headings)", () => {
  it("extracts one span per data row, keyed by the row's first cell, alongside the heading spans", () => {
    const spans = extractContentSpans(FILE, withTable);
    const rowSpans = spans.filter((s) => s.heading === "GAP·stream" || s.heading === "GAP·batch");
    expect(rowSpans).toHaveLength(2);
    expect(rowSpans.map((s) => s.path)).toEqual([`${FILE}#GAP·stream`, `${FILE}#GAP·batch`]);
    // headings are still extracted — additive, not a replacement
    expect(spans.map((s) => s.heading)).toContain("Facts");
    expect(spans.map((s) => s.heading)).toContain("Notes");
  });

  it("never turns the header row or the separator row into a span", () => {
    const spans = extractContentSpans(FILE, withTable);
    expect(spans.some((s) => s.heading === "id")).toBe(false);
    expect(spans.some((s) => s.heading === "---")).toBe(false);
  });

  it("dirties a row's own anchor when only that row is edited — an unrelated row and prose stay clean", () => {
    const anchor = rowAnchorFor(withTable, "GAP·stream");
    const rowEdited = withTable.replace("| GAP·stream | open |", "| GAP·stream | resolved |");
    expect(locateContent(anchor, rowEdited).hashChanged).toBe(true);

    const otherRowEdited = withTable.replace("| GAP·batch | closed |", "| GAP·batch | open |");
    expect(locateContent(anchor, otherRowEdited).hashChanged).toBe(false);
  });

  it("resolves a table-row anchor through the same dispatcher a heading anchor uses", () => {
    const anchor = rowAnchorFor(withTable, "GAP·batch");
    const result = locateAnchor(anchor, withTable);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });
});

describe("locateContent", () => {
  it("does not dirty a span when unrelated content is inserted elsewhere in the file", () => {
    const anchor = anchorFor(before, "Elminster");
    const after = `# A brand new section\n\nSomething unrelated.\n\n${before}`;
    const result = locateContent(anchor, after);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("dirties a span when its own body is edited", () => {
    const anchor = anchorFor(before, "Elminster");
    const after = before.replace("lives in Shadowdale", "lives in Waterdeep now");
    const result = locateContent(anchor, after);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true);
  });

  it("reports a renamed heading as not-found (honest miss)", () => {
    const anchor = anchorFor(before, "Elminster");
    const after = before.replace("# Elminster", "# Elminster Aumar");
    const result = locateContent(anchor, after);
    expect(result.found).toBe(false);
  });
});

describe("locateAnchor dispatcher", () => {
  it("routes .md artifacts to the content locator", () => {
    const anchor = anchorFor(before, "Mystra");
    const result = locateAnchor(anchor, before);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("routes .markdown artifacts to the content locator — the alias behaves identically", () => {
    const file = "lore/mage.markdown";
    const span = extractContentSpans(file, before).find((s) => s.heading === "Mystra")!;
    const anchor: Anchor = { locator: span.path, hash: "will-not-match", artifactPath: file };
    const result = locateAnchor(anchor, before);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true); // hash deliberately wrong above
  });

  it("routes .ts artifacts to the code locator", () => {
    const src = "export function f(): number {\n  return 1;\n}\n";
    const anchor: Anchor = {
      locator: "src/f.ts › function f",
      hash: "will-not-match",
      artifactPath: "src/f.ts",
    };
    const result = locateAnchor(anchor, src);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true); // hash deliberately wrong above
  });
});
