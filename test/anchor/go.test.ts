import { describe, expect, it } from "vitest";
import { extractSymbols, locateAnchor } from "../../src/anchor/index.js";
import { resolveAnchor } from "../../src/anchor/resolve.js";
import type { Anchor } from "../../src/anchor/index.js";

// Go anchoring (wasm grammar path). The property under test: a .go source
// yields the same locator format and self-invalidating hashes as TS — methods
// grouped under their receiver type — so Go code becomes anchored memory.
const GO_PATH = "src/shop.go";
const SHOP = [
  "package shop",
  "",
  "const MaxLevel = 5",
  "",
  "const (",
  "\tRareDrop  = 1",
  "\tEpicDrop  = 2",
  ")",
  "",
  "var mutable = 0",
  "",
  "type Shop struct {",
  "\tGold int",
  "}",
  "",
  "type Priced interface {",
  "\tCost() int",
  "}",
  "",
  "func IncomeBreakdown(gold int) int {",
  "\treturn gold",
  "}",
  "",
  "func (s Shop) DoRebrand() int {",
  "\treturn s.Gold",
  "}",
  "",
  "func (s *Shop) AddGold(n int) {",
  "\ts.Gold += n",
  "}",
  "",
].join("\n");

describe("Go symbol extraction", () => {
  it("extracts functions, types, methods grouped by receiver, and consts — in the TS locator format", () => {
    const byPath = new Map(extractSymbols(GO_PATH, SHOP).map((s) => [s.path, s]));
    const paths = [...byPath.keys()];

    expect(paths).toContain(`${GO_PATH} › function IncomeBreakdown`);
    expect(paths).toContain(`${GO_PATH} › type Shop`);
    expect(paths).toContain(`${GO_PATH} › type Priced`);
    expect(paths).toContain(`${GO_PATH} › const MaxLevel`);
    expect(paths).toContain(`${GO_PATH} › const RareDrop`);
    expect(paths).toContain(`${GO_PATH} › const EpicDrop`);
    // Methods nest under their receiver type — pointer and value receivers alike.
    expect(paths).toContain(`${GO_PATH} › type Shop › method DoRebrand`);
    expect(paths).toContain(`${GO_PATH} › type Shop › method AddGold`);

    // Mutable package `var` is not a stable anchor subject — never indexed.
    expect(paths.some((p) => p.includes("mutable"))).toBe(false);

    for (const s of byPath.values()) expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("relocates an unchanged symbol through the dispatcher with the hash intact", () => {
    const fn = extractSymbols(GO_PATH, SHOP).find((s) => s.name === "IncomeBreakdown")!;
    const anchor: Anchor = { locator: fn.path, hash: fn.hash, artifactPath: GO_PATH };
    const result = locateAnchor(anchor, SHOP);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("detects a body edit as staleness: same locator, changed hash", () => {
    const m = extractSymbols(GO_PATH, SHOP).find((s) => s.name === "DoRebrand")!;
    const edited = SHOP.replace("return s.Gold", "return 0");
    const result = locateAnchor({ locator: m.path, hash: m.hash, artifactPath: GO_PATH }, edited);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true);
  });

  it("ignores comment-only edits — a comment added inside a body does not change its hash", () => {
    const before = extractSymbols(GO_PATH, SHOP).find((s) => s.name === "IncomeBreakdown")!;
    const commented = SHOP.replace("\treturn gold", "\t// gold as-is\n\treturn gold");
    const after = extractSymbols(GO_PATH, commented).find((s) => s.name === "IncomeBreakdown")!;
    expect(after.hash).toBe(before.hash);
  });

  it("resolveAnchor anchors a .go method end to end, in the code strategy", () => {
    const anchor = resolveAnchor(
      { strategy: "code", artifactPath: GO_PATH, symbolName: "DoRebrand" },
      { readArtifact: (p) => (p === GO_PATH ? SHOP : undefined), verb: "remember" },
    );
    expect(anchor.locator).toBe(`${GO_PATH} › type Shop › method DoRebrand`);
    expect(anchor.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unknown .go symbol, naming the available candidates", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "code", artifactPath: GO_PATH, symbolName: "nonexistent" },
        { readArtifact: () => SHOP, verb: "remember" },
      ),
    ).toThrow(/no symbol named "nonexistent".*IncomeBreakdown/s);
  });
});
