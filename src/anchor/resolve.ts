import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractContentSpans } from "./content.js";
import { extractSymbols } from "./symbols.js";
import type { Anchor } from "./types.js";

/** The validated anchor request: exactly one resolvable target. */
export type AnchorTarget =
  | { strategy: "code"; artifactPath: string; symbolName: string }
  | { strategy: "content"; artifactPath: string; heading: string };

export interface ResolveAnchorOptions {
  /** Where the target's artifactPath resolves; required when anchoring unless readArtifact is given. */
  repoRoot?: string;
  /** Injection point for tests / hosts that already hold artifact sources. */
  readArtifact?: (artifactPath: string) => string | undefined;
  /** Error-message voice: every refusal is prefixed with the caller's own
   * name ("remember:", "reAnchor:"), so capture and repair share one
   * resolution while each module's errors read as its own. */
  verb: string;
}

/**
 * Artifact sources come from the host (readArtifact) or the repo root. An
 * unreadable artifact becomes `undefined` — the honest-miss refusal downstream,
 * never a write without verification.
 */
function readSource(artifactPath: string, opts: ResolveAnchorOptions): string | undefined {
  if (opts.readArtifact) return opts.readArtifact(artifactPath);
  if (opts.repoRoot === undefined) {
    throw new Error(`${opts.verb}: anchoring "${artifactPath}" needs repoRoot, or an injected readArtifact`);
  }
  try {
    return readFileSync(join(opts.repoRoot, artifactPath), "utf8");
  } catch {
    return undefined;
  }
}

interface Candidate {
  name: string;
  /** Full locator path: "src/foo.ts › function foo" or "doc.md#Heading". */
  path: string;
  hash: string;
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx"]);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

/**
 * Exact-match resolution against the artifact's real source, dispatching the
 * same way anchor/locate-any.ts does (code extensions → tree-sitter symbols,
 * everything else → markdown heading spans; the ext registry in Seam 9 will
 * own this routing). Zero matches refuses naming the available candidates;
 * more than one refuses naming every candidate locator — an arbitrary pick
 * among same-named candidates is how drift is born.
 *
 * Shared by capture and repair (Seam 4): a re-anchor must never succeed where
 * a fresh remember of the same anchor would refuse.
 */
export function resolveAnchor(target: AnchorTarget, opts: ResolveAnchorOptions): Anchor {
  const source = readSource(target.artifactPath, opts);
  if (source === undefined) {
    throw new Error(`${opts.verb}: could not read artifact "${target.artifactPath}" — refusing to write an unanchored guess`);
  }

  if (target.strategy === "code") {
    if (!CODE_EXTENSIONS.has(extensionOf(target.artifactPath))) {
      throw new Error(`${opts.verb}: no symbol locator strategy for "${target.artifactPath}" — symbolName anchors .ts/.tsx sources`);
    }
    const candidate = requireSingleMatch(
      extractSymbols(target.artifactPath, source).map((s) => ({ name: s.name, path: s.path, hash: s.hash })),
      target.symbolName,
      target.artifactPath,
      "symbol",
      opts.verb,
    );
    return { locator: candidate.path, hash: candidate.hash, artifactPath: target.artifactPath };
  }

  const candidate = requireSingleMatch(
    extractContentSpans(target.artifactPath, source).map((s) => ({ name: s.heading, path: s.path, hash: s.hash })),
    target.heading,
    target.artifactPath,
    "heading",
    opts.verb,
  );
  return { locator: candidate.path, hash: candidate.hash, artifactPath: target.artifactPath };
}

function requireSingleMatch(
  all: Candidate[],
  requested: string,
  artifactPath: string,
  noun: "symbol" | "heading",
  verb: string,
): Candidate {
  const matches = all.filter((c) => c.name === requested);
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    const available = [...new Set(all.map((c) => c.name))];
    const listed = available.length > 0 ? available.join(", ") : "(none)";
    throw new Error(`${verb}: no ${noun} named "${requested}" in "${artifactPath}" — available ${noun}s: ${listed}`);
  }
  const paths = matches.map((m) => m.path).join("; ");
  throw new Error(
    `${verb}: ${noun} name "${requested}" is ambiguous in "${artifactPath}" (${matches.length} matches) — pick one: ${paths}`,
  );
}
