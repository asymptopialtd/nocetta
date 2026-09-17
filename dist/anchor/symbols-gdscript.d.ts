import type { SymbolInfo } from "./types.js";
/**
 * Enumerate stable-path symbols from a GDScript source file: top-level
 * functions, consts, and the file's `class_name`, plus inner `class`
 * definitions with their methods and consts. Mutable `var` stays unindexed
 * (not a stable subject, mirroring how the TS extractor skips `let`). The
 * locator segments — `function foo`, `const FOO`, `class Foo`, `method bar` —
 * match the TS format exactly, so a `.gd` anchor reads like any other.
 */
export declare function extractGdscriptSymbols(filePath: string, source: string): SymbolInfo[];
