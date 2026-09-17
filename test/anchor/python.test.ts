import { describe, expect, it } from "vitest";
import { extractSymbols, locateAnchor } from "../../src/anchor/index.js";
import { resolveAnchor } from "../../src/anchor/resolve.js";
import type { Anchor } from "../../src/anchor/index.js";

// Python anchoring (wasm grammar path). The property under test: a .py source
// yields the same locator format and self-invalidating hashes as TS, so Python
// code becomes anchored memory, not unanchored notes.
const PY_PATH = "src/shop.py";
const SHOP = [
  "MAX_LEVEL = 5",
  "rates = []  # mutable, not a stable anchor subject",
  "",
  "def income_breakdown(gold):",
  '    return {"gold": gold}',
  "",
  "@staticmethod",
  "def decorated_helper():",
  "    return 1",
  "",
  "class Shop:",
  "    BASE_COST = 100",
  "",
  "    def do_rebrand(self):",
  "        return self.BASE_COST",
  "",
  "    @property",
  "    def total(self):",
  "        return 0",
  "",
].join("\n");

describe("Python symbol extraction", () => {
  it("extracts functions, classes with methods, and ALL_CAPS constants — in the TS locator format", () => {
    const byPath = new Map(extractSymbols(PY_PATH, SHOP).map((s) => [s.path, s]));
    const paths = [...byPath.keys()];

    expect(paths).toContain(`${PY_PATH} › function income_breakdown`);
    expect(paths).toContain(`${PY_PATH} › function decorated_helper`);
    expect(paths).toContain(`${PY_PATH} › const MAX_LEVEL`);
    expect(paths).toContain(`${PY_PATH} › class Shop`);
    expect(paths).toContain(`${PY_PATH} › class Shop › method do_rebrand`);
    expect(paths).toContain(`${PY_PATH} › class Shop › method total`);
    expect(paths).toContain(`${PY_PATH} › class Shop › const BASE_COST`);

    // Lowercase module variable is mutable by convention — never indexed.
    expect(paths.some((p) => p.includes("rates"))).toBe(false);

    for (const s of byPath.values()) expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("relocates an unchanged symbol through the dispatcher with the hash intact", () => {
    const fn = extractSymbols(PY_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const anchor: Anchor = { locator: fn.path, hash: fn.hash, artifactPath: PY_PATH };
    const result = locateAnchor(anchor, SHOP);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("detects a body edit as staleness: same locator, changed hash", () => {
    const fn = extractSymbols(PY_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const edited = SHOP.replace('return {"gold": gold}', "return {}");
    const result = locateAnchor({ locator: fn.path, hash: fn.hash, artifactPath: PY_PATH }, edited);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true);
  });

  it("ignores comment-only edits — a comment added inside a body does not change its hash", () => {
    const before = extractSymbols(PY_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const commented = SHOP.replace('    return {"gold": gold}', '    # breakdown by source\n    return {"gold": gold}');
    const after = extractSymbols(PY_PATH, commented).find((s) => s.name === "income_breakdown")!;
    expect(after.hash).toBe(before.hash);
  });

  it("resolveAnchor anchors a .py method end to end, in the code strategy", () => {
    const anchor = resolveAnchor(
      { strategy: "code", artifactPath: PY_PATH, symbolName: "do_rebrand" },
      { readArtifact: (p) => (p === PY_PATH ? SHOP : undefined), verb: "remember" },
    );
    expect(anchor.locator).toBe(`${PY_PATH} › class Shop › method do_rebrand`);
    expect(anchor.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unknown .py symbol, naming the available candidates", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "code", artifactPath: PY_PATH, symbolName: "nonexistent" },
        { readArtifact: () => SHOP, verb: "remember" },
      ),
    ).toThrow(/no symbol named "nonexistent".*income_breakdown/s);
  });
});
