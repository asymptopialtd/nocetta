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
export declare const ANCHOR_STRATEGY_BY_EXTENSION: Readonly<Record<string, AnchorStrategy>>;
export declare function extensionOf(path: string): string;
/**
 * Registry lookup with the honest refusal attached. `verb` voices the error
 * as the caller's own ("remember:", "reAnchor:"), matching each module's
 * error-prefix convention; drift passes none. An extensionless artifact has
 * no extension to name, so the path stands in.
 */
export declare function strategyFor(artifactPath: string, verb?: string): AnchorStrategy;
/**
 * Dispatches to the right locator strategy by the artifact's registry entry:
 * tree-sitter symbols (Slice 1) for code, Markdown heading spans (Slice 8)
 * for content artifacts. Slice 3's check() calls this instead of the
 * code-only `locate` so it works uniformly across `claim`/`lore-fact` anchors.
 */
export declare function locateAnchor(anchor: Anchor, sourceAfter: string, locator?: SymbolLocator): LocateResult;
