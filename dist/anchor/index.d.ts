export { extractSymbols, defaultLocator } from "./symbols.js";
export type { SymbolLocator } from "./locator.js";
export { locate } from "./locate.js";
export { extractContentSpans, locateContent } from "./content.js";
export type { ContentSpan } from "./content.js";
export { locateAnchor, strategyFor, ANCHOR_STRATEGY_BY_EXTENSION } from "./locate-any.js";
export type { AnchorStrategy } from "./locate-any.js";
export type { Anchor, SymbolInfo, SymbolKind, LocateResult } from "./types.js";
