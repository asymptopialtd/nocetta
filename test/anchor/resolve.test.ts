import { describe, expect, it } from "vitest";
import { resolveAnchor } from "../../src/anchor/resolve.js";

// The registry refusal must arrive in the caller's own voice: capture says
// "remember:", repair says "reAnchor:" — one resolution, each module's errors
// read as its own. The registry check also precedes the artifact read, so no
// repoRoot/readArtifact is needed for these refusals to fire.
describe("resolveAnchor routing refusals", () => {
  it("refuses a .py symbol target with the registry error carrying the remember prefix", () => {
    expect(() => resolveAnchor({ strategy: "code", artifactPath: "src/model.py", symbolName: "Model" }, { verb: "remember" })).toThrow(
      'remember: no anchor strategy for ".py" — anchored kinds support TypeScript/JavaScript sources and Markdown documents',
    );
  });

  it("refuses a .py heading target the same way — content routing is registry-bound too", () => {
    expect(() => resolveAnchor({ strategy: "content", artifactPath: "src/model.py", heading: "Model" }, { verb: "reAnchor" })).toThrow(
      'reAnchor: no anchor strategy for ".py" — anchored kinds support TypeScript/JavaScript sources and Markdown documents',
    );
  });

  it("refuses a strategy that contradicts the registry — heading on a code source cannot mis-parse", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "content", artifactPath: "src/foo.ts", heading: "foo" },
        { verb: "remember", readArtifact: () => "export function foo(): number {\n  return 1;\n}\n" },
      ),
    ).toThrow(/remember: "src\/foo\.ts" takes the code strategy — heading anchors Markdown documents/);
  });

  it("refuses a strategy that contradicts the registry the other way — symbolName on a markdown document", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "code", artifactPath: "lore/mage.md", symbolName: "Elminster" },
        { verb: "remember", readArtifact: () => "# Elminster\n" },
      ),
    ).toThrow(/remember: "lore\/mage\.md" takes the content strategy — symbolName anchors TypeScript\/JavaScript sources/);
  });
});

// Heading matching tolerates surrounding whitespace and case only — never
// substring/fuzzy matching, which risks anchoring the wrong heading.
describe("heading matching tolerates whitespace and case", () => {
  const MD = "# Elminster\n\nArchmage of Shadowdale.\n";

  it("resolves a heading that differs only in surrounding whitespace and case", () => {
    const result = resolveAnchor(
      { strategy: "content", artifactPath: "lore/mage.md", heading: "  elminster  " },
      { verb: "remember", readArtifact: () => MD },
    );
    expect(result.locator).toBe("lore/mage.md#Elminster");
  });

  it("still refuses honestly, listing candidates, when nothing matches even normalized", () => {
    expect(() =>
      resolveAnchor({ strategy: "content", artifactPath: "lore/mage.md", heading: "Mystra" }, { verb: "remember", readArtifact: () => MD }),
    ).toThrow(/no heading named "Mystra" in "lore\/mage\.md" — available headings: Elminster/);
  });

  it("does not extend the tolerance to symbol names — code identifiers stay byte-exact", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "code", artifactPath: "src/foo.ts", symbolName: "FOO" },
        { verb: "remember", readArtifact: () => "export function foo(): number {\n  return 1;\n}\n" },
      ),
    ).toThrow(/no symbol named "FOO" in "src\/foo\.ts" — available symbols: foo/);
  });
});
