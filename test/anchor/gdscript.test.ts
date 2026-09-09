import { describe, expect, it } from "vitest";
import { extractSymbols, locateAnchor } from "../../src/anchor/index.js";
import { resolveAnchor } from "../../src/anchor/resolve.js";
import type { Anchor } from "../../src/anchor/index.js";

// GDScript anchoring (native grammar path, settled 2026-09-09). The property
// under test: a .gd source yields the same locator format and self-invalidating
// hashes as TS, so Godot code becomes anchored memory, not unanchored notes.
const GD_PATH = "src/shop.gd";
const SHOP = [
  "class_name Shop",
  "extends Node",
  "",
  'const RARITIES = ["common", "rare", "epic"]',
  "",
  "var gold := 0",
  "",
  "func income_breakdown() -> Dictionary:",
  '\treturn {"gold": gold}',
  "",
  "func max_level_for(kind: String) -> int:",
  "\treturn 5",
  "",
  "class Upgrade:",
  "\tconst COST := 100",
  "\tfunc do_rebrand() -> void:",
  "\t\tgold -= COST",
  "",
].join("\n");

describe("GDScript symbol extraction", () => {
  it("extracts top-level functions, consts, the file class, and inner classes with methods — all in the TS locator format", () => {
    const byName = new Map(extractSymbols(GD_PATH, SHOP).map((s) => [s.path, s]));
    const paths = [...byName.keys()];

    expect(paths).toContain(`${GD_PATH} › function income_breakdown`);
    expect(paths).toContain(`${GD_PATH} › function max_level_for`);
    expect(paths).toContain(`${GD_PATH} › const RARITIES`);
    expect(paths).toContain(`${GD_PATH} › class Shop`);
    expect(paths).toContain(`${GD_PATH} › class Upgrade`);
    expect(paths).toContain(`${GD_PATH} › class Upgrade › method do_rebrand`);
    expect(paths).toContain(`${GD_PATH} › class Upgrade › const COST`);

    // Mutable `var` is not a stable anchor subject — never indexed.
    expect(paths.some((p) => p.includes("gold"))).toBe(false);

    for (const s of byName.values()) expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("relocates an unchanged symbol through the dispatcher with the hash intact", () => {
    const fn = extractSymbols(GD_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const anchor: Anchor = { locator: fn.path, hash: fn.hash, artifactPath: GD_PATH };
    const result = locateAnchor(anchor, SHOP);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(false);
  });

  it("detects a body edit as staleness: same locator, changed hash", () => {
    const fn = extractSymbols(GD_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const edited = SHOP.replace('return {"gold": gold}', "return {}");
    const result = locateAnchor({ locator: fn.path, hash: fn.hash, artifactPath: GD_PATH }, edited);
    expect(result.found).toBe(true);
    expect(result.hashChanged).toBe(true);
  });

  it("ignores comment-only edits — a comment added inside a body does not change its hash", () => {
    const before = extractSymbols(GD_PATH, SHOP).find((s) => s.name === "income_breakdown")!;
    const commented = SHOP.replace('\treturn {"gold": gold}', '\t# breakdown by source\n\treturn {"gold": gold}');
    const after = extractSymbols(GD_PATH, commented).find((s) => s.name === "income_breakdown")!;
    expect(after.hash).toBe(before.hash);
  });

  it("resolveAnchor anchors a .gd symbol end to end, in the code strategy", () => {
    const anchor = resolveAnchor(
      { strategy: "code", artifactPath: GD_PATH, symbolName: "do_rebrand" },
      { readArtifact: (p) => (p === GD_PATH ? SHOP : undefined), verb: "remember" },
    );
    expect(anchor.locator).toBe(`${GD_PATH} › class Upgrade › method do_rebrand`);
    expect(anchor.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an unknown .gd symbol, naming the available candidates", () => {
    expect(() =>
      resolveAnchor(
        { strategy: "code", artifactPath: GD_PATH, symbolName: "nonexistent" },
        { readArtifact: () => SHOP, verb: "remember" },
      ),
    ).toThrow(/no symbol named "nonexistent".*income_breakdown/s);
  });
});
