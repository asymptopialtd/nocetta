import type { SymbolLocator } from "./locator.js";
import type { Anchor, LocateResult } from "./types.js";
/**
 * Relocate an anchor's symbol in a (possibly edited) version of its source.
 *
 * Strategy: exact path match first. If the exact locator path is gone, fall
 * back to a same-name/unchanged-hash search anywhere in the file — this is
 * what lets a structural move (e.g. a method moved to another class) still
 * resolve and report its updated path, while a genuine rename (name changed,
 * or the body changed too) stays an honest miss rather than a guess.
 */
export declare function locate(anchor: Anchor, sourceAfter: string, locator?: SymbolLocator): LocateResult;
