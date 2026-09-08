import { locateContent } from "./content.js";
import { locate } from "./locate.js";
import type { Anchor, LocateResult } from "./types.js";

const CODE_EXTENSIONS = new Set([".ts", ".tsx"]);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

/**
 * Dispatches to the right locator strategy by artifact extension: tree-sitter
 * symbols (Slice 1) for code, Markdown heading spans (Slice 8) for content
 * artifacts. Slice 3's check() calls this instead of the code-only `locate`
 * so it works uniformly across `claim`/`lore-fact` anchors.
 */
export function locateAnchor(anchor: Anchor, sourceAfter: string): LocateResult {
  return CODE_EXTENSIONS.has(extensionOf(anchor.artifactPath)) ? locate(anchor, sourceAfter) : locateContent(anchor, sourceAfter);
}
