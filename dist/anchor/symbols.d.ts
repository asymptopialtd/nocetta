import type { SymbolInfo } from "./types.js";
import type { SymbolLocator } from "./locator.js";
/**
 * Enumerate stable-path symbols from a source file, routed to the grammar its
 * extension takes. `.gd` (GDScript) goes to the native binding; `.py` and `.go`
 * go to their own wasm modules; every other code extension the registry admits
 * (TypeScript, and JavaScript riding the TS grammar) goes to the wasm parser
 * above. The locator-string format is identical across all of them, so an
 * anchor reads the same whatever the language.
 */
export declare function extractSymbols(filePath: string, source: string): SymbolInfo[];
/**
 * nocetta's default {@link SymbolLocator}: the built-in extractors above.
 * Used everywhere unless a host injects its own locator.
 */
export declare const defaultLocator: SymbolLocator;
