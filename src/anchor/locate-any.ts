import { locateContent } from "./content.js";
import { locate } from "./locate.js";
import type { SymbolLocator } from "./locator.js";
import type { Anchor, LocateResult } from "./types.js";

/** Which locator strategy an artifact takes, per its extension. */
export type AnchorStrategy = "code" | "content";

/**
 * The extension registry — the one map deciding which locator strategy an
 * artifact takes. Capture (resolve.ts), repair (through resolve), and drift
 * (locateAnchor) all route through it, so they can never fork into
 * disagreeing routing. The map is closed on purpose: an extension not listed
 * here is a hard, honest refusal (light 5), never a fallback parse — parsing
 * a Python file's `#` comments as markdown headings is a wrong answer, not a
 * best effort.
 */
export const ANCHOR_STRATEGY_BY_EXTENSION: Readonly<Record<string, AnchorStrategy>> = {
  // The JS extensions deliberately ride the TypeScript grammar: it parses
  // plain JS as a near-superset, so one grammar serves both and locator
  // strings stay a single format.
  ".ts": "code",
  ".tsx": "code",
  ".mts": "code",
  ".cts": "code",
  ".js": "code",
  ".jsx": "code",
  ".mjs": "code",
  ".cjs": "code",
  // GDScript rides a native grammar, not the wasm one (see symbols-gdscript.ts),
  // but the strategy is still "code" — the registry cares which locator, not
  // which backend.
  ".gd": "code",
  // Python and Go each ride their own prebuilt-wasm grammar (see
  // symbols-python.ts / symbols-go.ts); strategy is still "code".
  ".py": "code",
  ".go": "code",
  ".md": "content",
  ".markdown": "content",
};

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

/**
 * Registry lookup with the honest refusal attached. `verb` voices the error
 * as the caller's own ("remember:", "reAnchor:"), matching each module's
 * error-prefix convention; drift passes none. An extensionless artifact has
 * no extension to name, so the path stands in.
 */
export function strategyFor(artifactPath: string, verb?: string): AnchorStrategy {
  const ext = extensionOf(artifactPath);
  const strategy = ANCHOR_STRATEGY_BY_EXTENSION[ext];
  if (strategy) return strategy;
  const named = ext === "" ? `"${artifactPath}" (no extension)` : `"${ext}"`;
  throw new Error(
    `${verb ? `${verb}: ` : ""}no anchor strategy for ${named} — anchored kinds support TypeScript/JavaScript, GDScript, Python, and Go sources and Markdown documents`,
  );
}

/**
 * Dispatches to the right locator strategy by the artifact's registry entry:
 * tree-sitter symbols (Slice 1) for code, Markdown heading spans (Slice 8)
 * for content artifacts. Slice 3's check() calls this instead of the
 * code-only `locate` so it works uniformly across `claim`/`lore-fact` anchors.
 */
export function locateAnchor(anchor: Anchor, sourceAfter: string, locator?: SymbolLocator): LocateResult {
  return strategyFor(anchor.artifactPath) === "code" ? locate(anchor, sourceAfter, locator) : locateContent(anchor, sourceAfter);
}
