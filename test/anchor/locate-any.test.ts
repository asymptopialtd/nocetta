import { describe, expect, it } from "vitest";
import { ANCHOR_STRATEGY_BY_EXTENSION, extractSymbols, locateAnchor, strategyFor } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";

// Seam 9: the extension registry is the one routing map. These tests pin that
// it is closed (no silent fallback), that the JS aliasing is real (plain JS
// anchors through the TypeScript grammar), and that unknown extensions refuse
// honestly instead of mis-parsing.
describe("the anchor extension registry", () => {
  it("is closed: exactly the eleven code and two content extensions, no implicit default", () => {
    expect(ANCHOR_STRATEGY_BY_EXTENSION).toEqual({
      ".ts": "code",
      ".tsx": "code",
      ".mts": "code",
      ".cts": "code",
      ".js": "code",
      ".jsx": "code",
      ".mjs": "code",
      ".cjs": "code",
      ".gd": "code",
      ".py": "code",
      ".go": "code",
      ".md": "content",
      ".markdown": "content",
    });
  });

  it("refuses an unsupported extension honestly, naming it — never a wrong-strategy parse", () => {
    expect(() => strategyFor("src/model.rs")).toThrow(
      'no anchor strategy for ".rs" — anchored kinds support TypeScript/JavaScript, GDScript, Python, and Go sources and Markdown documents',
    );
  });

  it("refuses an extensionless artifact, naming the path in place of the extension it lacks", () => {
    expect(() => strategyFor("Dockerfile")).toThrow(
      'no anchor strategy for "Dockerfile" (no extension) — anchored kinds support TypeScript/JavaScript, GDScript, Python, and Go sources and Markdown documents',
    );
  });

  it("routes .ts to the code locator through the registry", () => {
    const src = "export function f(): number {\n  return 1;\n}\n";
    const fn = extractSymbols("src/f.ts", src).find((s) => s.name === "f")!;
    const anchor: Anchor = { locator: fn.path, hash: fn.hash, artifactPath: "src/f.ts" };
    const result = locateAnchor(anchor, src);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("routes .md to the content locator through the registry", () => {
    const src = "# Elminster\n\nArchmage of Shadowdale.\n";
    const span = { path: "lore/mage.md#Elminster", hash: "stale-on-purpose" };
    const anchor: Anchor = { locator: span.path, hash: span.hash, artifactPath: "lore/mage.md" };
    const result = locateAnchor(anchor, src);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true); // hash deliberately wrong above
  });

  it("locateAnchor refuses an unknown extension too — drift cannot silently mis-route what capture refused", () => {
    const anchor: Anchor = { locator: "src/model.rs#Model", hash: "h", artifactPath: "src/model.rs" };
    expect(() => locateAnchor(anchor, "# Model\n")).toThrow(/no anchor strategy for "\.rs"/);
  });
});

describe("JS riding the TypeScript grammar", () => {
  const JS_SOURCE = `function greet(name) {
  return "hi " + name;
}

const EXPORTED_LIMIT = 10;
`;

  it("extracts functions from plain .js with a real locator and hash, and relocates through the dispatcher", () => {
    for (const file of ["src/greet.js", "src/greet.mjs"]) {
      const symbols = extractSymbols(file, JS_SOURCE);
      const fn = symbols.find((s) => s.name === "greet");
      expect(fn, file).toBeDefined();
      expect(fn!.path).toBe(`${file} › function greet`);
      expect(fn!.hash).toMatch(/^[0-9a-f]{64}$/);

      const anchor: Anchor = { locator: fn!.path, hash: fn!.hash, artifactPath: file };
      const result = locateAnchor(anchor, JS_SOURCE);
      expect(result.found).toBe(true);
      expect(result.hashChanged).toBe(false);
    }
  });

  it("hashes identical JS bodies identically across the aliased extensions — one grammar, one hash format", () => {
    const js = extractSymbols("src/greet.js", JS_SOURCE).find((s) => s.name === "greet")!;
    const ts = extractSymbols("src/greet.ts", JS_SOURCE).find((s) => s.name === "greet")!;
    expect(js.hash).toBe(ts.hash);
  });
});
