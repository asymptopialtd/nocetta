import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractContentSpans } from "./content.js";
import { strategyFor } from "./locate-any.js";
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

/**
 * Exact-match resolution against the artifact's real source, routed by the
 * shared extension registry (anchor/locate-any.ts) — the same map drift's
 * locateAnchor uses, so capture, repair, and drift can never disagree about
 * which files take which strategy. An unknown extension refuses in the
 * caller's voice, and a request whose strategy contradicts the registry
 * refuses rather than mis-parsing the artifact. Zero matches refuses naming
 * the available candidates; more than one refuses naming every candidate
 * locator — an arbitrary pick among same-named candidates is how drift is
 * born.
 *
 * Shared by capture and repair (Seam 4): a re-anchor must never succeed where
 * a fresh remember of the same anchor would refuse.
 */
export function resolveAnchor(target: AnchorTarget, opts: ResolveAnchorOptions): Anchor {
  // The request is checked against the registry before the artifact is read:
  // an unroutable request is a shape error, not an artifact-state error.
  const strategy = strategyFor(target.artifactPath, opts.verb);
  if (strategy !== target.strategy) {
    throw new Error(
      `${opts.verb}: "${target.artifactPath}" takes the ${strategy} strategy — ${
        target.strategy === "code" ? "symbolName anchors TypeScript/JavaScript sources" : "heading anchors Markdown documents"
      }`,
    );
  }

  const source = readSource(target.artifactPath, opts);
  if (source === undefined) {
    throw new Error(`${opts.verb}: could not read artifact "${target.artifactPath}" — refusing to write an unanchored guess`);
  }

  if (target.strategy === "code") {
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

/**
 * Heading matching tolerates surrounding whitespace and case — a heading
 * typed back slightly differently ("  Deployment  ", "deployment") still
 * resolves — but nothing fuzzier: no substring or prefix matching, which
 * would risk anchoring to the wrong heading (noise is a product killer,
 * memory ddc165f1). Symbol names stay byte-exact; a code identifier's case
 * is part of its identity.
 */
function normalizeForMatch(noun: "symbol" | "heading", name: string): string {
  return noun === "heading" ? name.trim().replace(/\s+/g, " ").toLowerCase() : name;
}

function requireSingleMatch(
  all: Candidate[],
  requested: string,
  artifactPath: string,
  noun: "symbol" | "heading",
  verb: string,
): Candidate {
  const target = normalizeForMatch(noun, requested);
  const matches = all.filter((c) => normalizeForMatch(noun, c.name) === target);
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
