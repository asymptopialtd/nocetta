import { defaultLocator } from "./symbols.js";
import type { SymbolLocator } from "./locator.js";
import type { Anchor, LocateResult } from "./types.js";

function lastSegment(path: string): string {
  const parts = path.split(" › ");
  return parts[parts.length - 1] ?? path;
}

/**
 * Relocate an anchor's symbol in a (possibly edited) version of its source.
 *
 * Strategy: exact path match first. If the exact locator path is gone, fall
 * back to a same-name/unchanged-hash search anywhere in the file — this is
 * what lets a structural move (e.g. a method moved to another class) still
 * resolve and report its updated path, while a genuine rename (name changed,
 * or the body changed too) stays an honest miss rather than a guess.
 */
export function locate(anchor: Anchor, sourceAfter: string, locator: SymbolLocator = defaultLocator): LocateResult {
  const symbols = locator.extractSymbols(anchor.artifactPath, sourceAfter);

  const exact = symbols.find((s) => s.path === anchor.locator);
  if (exact) {
    return { found: true, hashChanged: exact.hash !== anchor.hash, symbol: exact };
  }

  const name = lastSegment(anchor.locator);
  const candidates = symbols.filter((s) => lastSegment(s.path) === name && s.hash === anchor.hash);
  if (candidates.length === 1) {
    return { found: true, hashChanged: false, symbol: candidates[0]! };
  }

  return { found: false, hashChanged: false };
}
