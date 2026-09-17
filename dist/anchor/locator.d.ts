import type { SymbolInfo } from "./types.js";
/**
 * The pluggable code-reading capability nocetta's anchoring depends on: parse a
 * source file into stable-path symbols carrying normalized content hashes.
 *
 * nocetta ships a default implementation (`nativeLocator`, its own tree-sitter),
 * so it works standalone with no configuration. A host that already has a code
 * parser — e.g. sandkeep's `code-graph` — can implement this interface and pass
 * it in, so a single parser serves the whole application. nocetta never imports
 * the host: the dependency points inward, through this port.
 */
export interface SymbolLocator {
    extractSymbols(filePath: string, source: string): SymbolInfo[];
}
