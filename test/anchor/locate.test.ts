import { describe, it, expect } from "vitest";
import { extractSymbols, locate } from "../../src/anchor/index.js";
import type { Anchor } from "../../src/anchor/index.js";

const FILE = "src/fixture.ts";

function anchorFor(source: string, path: string): Anchor {
  const symbols = extractSymbols(FILE, source);
  const symbol = symbols.find((s) => s.path === path);
  if (!symbol) throw new Error(`fixture bug: no symbol at ${path}`);
  return { locator: symbol.path, hash: symbol.hash, artifactPath: FILE };
}

describe("extractSymbols", () => {
  it("enumerates functions, classes, methods, and top-level consts (exported or not) with stable paths", () => {
    const source = `
export function greet(name: string): string {
  return "hi " + name;
}

class Widget {
  render(): string {
    return "widget";
  }
}

export const DEFAULT_SIZE = 42;

const internalOnly = "a file-local const is a symbol too";

function inner(): void {
  const nested = "never a symbol — visit() never descends into a function body";
  void nested;
}

let mutable = "let is never a symbol";
void mutable;
`;
    const symbols = extractSymbols(FILE, source);
    const paths = symbols.map((s) => s.path).sort();
    expect(paths).toEqual(
      [
        `${FILE} › function greet`,
        `${FILE} › class Widget`,
        `${FILE} › class Widget › method render`,
        `${FILE} › const DEFAULT_SIZE`,
        `${FILE} › const internalOnly`,
        `${FILE} › function inner`,
      ].sort(),
    );
    // nested and `let` declarations are still never symbols
    expect(symbols.some((s) => s.name === "nested")).toBe(false);
    expect(symbols.some((s) => s.name === "mutable")).toBe(false);
  });
});

describe("locate", () => {
  it("(a) inserting lines above a symbol does not change its hash", () => {
    const before = `export function foo(): number {\n  return 1;\n}\n`;
    const anchor = anchorFor(before, `${FILE} › function foo`);

    const after = `// a new leading comment\nconst unrelated = 1;\n\n${before}`;
    const result = locate(anchor, after);

    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("(b) editing the symbol body changes the hash", () => {
    const before = `export function foo(): number {\n  return 1;\n}\n`;
    const anchor = anchorFor(before, `${FILE} › function foo`);

    const after = `export function foo(): number {\n  return 2;\n}\n`;
    const result = locate(anchor, after);

    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true);
  });

  it("(c) renaming the symbol is reported as not-found (honest miss)", () => {
    const before = `export function foo(): number {\n  return 1;\n}\n`;
    const anchor = anchorFor(before, `${FILE} › function foo`);

    const after = `export function fooRenamed(): number {\n  return 1;\n}\n`;
    const result = locate(anchor, after);

    expect(result.found).toBe(false);
  });

  it("(d) moving a method between classes updates its path", () => {
    const before = `
class Foo {
  bar(): string {
    return "bar";
  }
}

class Baz {
}
`;
    const anchor = anchorFor(before, `${FILE} › class Foo › method bar`);

    const after = `
class Foo {
}

class Baz {
  bar(): string {
    return "bar";
  }
}
`;
    const result = locate(anchor, after);

    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
    expect(result.symbol?.path).toBe(`${FILE} › class Baz › method bar`);
  });

  it("comment-only edits inside a symbol body do not change its hash", () => {
    const before = `export function foo(): number {\n  return 1;\n}\n`;
    const anchor = anchorFor(before, `${FILE} › function foo`);

    const after = `export function foo(): number {\n  // now with a comment\n  return 1;\n}\n`;
    const result = locate(anchor, after);

    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });
});
