import type { SymbolInfo } from "./types.js";
/**
 * Enumerate stable-path symbols from a Python source file: top-level
 * functions, classes (with their methods and ALL_CAPS class constants), and
 * module-level ALL_CAPS constants. A decorated function or class is unwrapped
 * to the definition it wraps and anchored there — so its span excludes the
 * decorators, and adding one does not change the hash, mirroring how the TS
 * extractor anchors the declaration inside an `export`. The locator segments —
 * `function foo`, `class Foo`, `method bar`, `const FOO` — match the TS format
 * exactly, so a `.py` anchor reads like any other.
 */
export declare function extractPythonSymbols(filePath: string, source: string): SymbolInfo[];
