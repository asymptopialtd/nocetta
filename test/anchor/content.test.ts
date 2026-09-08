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
