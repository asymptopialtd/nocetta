import type { SymbolInfo } from "./types.js";
/**
 * Enumerate stable-path symbols from a Go source file: top-level functions,
 * methods (grouped under their receiver type), type declarations (structs,
 * interfaces, aliases — kind `class`, the nearest named-type subject), and
 * top-level consts. Mutable `var` declarations stay unindexed, mirroring how
 * the TS extractor skips `let`. The locator segments — `function foo`,
 * `type Foo`, `method bar`, `const FOO` — carry Go's own `type` keyword but
 * share the SEP-joined format, so a `.go` anchor relocates like any other.
 */
export declare function extractGoSymbols(filePath: string, source: string): SymbolInfo[];
