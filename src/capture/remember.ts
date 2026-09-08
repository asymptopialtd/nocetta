import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractContentSpans } from "../anchor/content.js";
import { extractSymbols } from "../anchor/symbols.js";
import type { Anchor } from "../anchor/types.js";
import { findConflicts } from "../supersede/conflicts.js";
import type { Conflict } from "../supersede/conflicts.js";
import { supersede } from "../supersede/supersede.js";
import { writeNode } from "../store/store.js";
import type { Authority, MemoryNode, NodeKind } from "../store/types.js";
import { createNode } from "./create.js";

export interface RememberRequest {
  body: string;
  kind: NodeKind;
  /** Repo-relative. Required when symbolName or heading is given. */
  artifactPath?: string;
  /** Code anchor: exact symbol-name match. Mutually exclusive with heading. */
  symbolName?: string;
  /** Content anchor: exact heading match. Mutually exclusive with symbolName. */
  heading?: string;
  /** Defaults to "global". */
  scope?: string;
  /** Defaults to "default". */
  authority?: Authority;
  /** Capture-as-supersession: the new node supersedes this id in one call. */
  supersedes?: string;
}

export interface RememberOptions {
  /** Where `artifactPath` resolves; required when anchoring unless readArtifact is given. */
  repoRoot?: string;
  /** Injection point for tests / hosts that already hold artifact sources. */
  readArtifact?: (artifactPath: string) => string | undefined;
  /** Deterministic timestamps in tests. */
  now?: string;
}

/** The validated anchor request: exactly one resolvable target, or none. */
type AnchorTarget =
  | { strategy: "code"; artifactPath: string; symbolName: string }
  | { strategy: "content"; artifactPath: string; heading: string };

/**
 * Validate up front and narrow the request to an anchor target, so the rest
 * of remember() can assume every violation already threw. A bare artifactPath
 * also refuses: it would quietly anchor nothing, which is the unanchored-guess
 * shape capture exists to prevent.
 */
function anchorTarget(req: RememberRequest): AnchorTarget | null {
  if (req.body.trim().length === 0) throw new Error("remember: body must be non-empty");

  const { symbolName, heading, artifactPath } = req;
  if (req.kind === "entity" && (symbolName !== undefined || heading !== undefined || artifactPath !== undefined)) {
    throw new Error("remember: entity nodes are unanchored — drop symbolName/heading/artifactPath");
  }
  if (symbolName !== undefined && heading !== undefined) {
    throw new Error("remember: symbolName and heading are mutually exclusive — one anchor target per node");
  }
  if (symbolName !== undefined) {
    if (artifactPath === undefined) {
      throw new Error("remember: artifactPath is required when symbolName is given");
    }
    return { strategy: "code", artifactPath, symbolName };
  }
  if (heading !== undefined) {
    if (artifactPath === undefined) {
      throw new Error("remember: artifactPath is required when heading is given");
    }
    return { strategy: "content", artifactPath, heading };
  }
  if (artifactPath !== undefined) {
    throw new Error(
      `remember: artifactPath "${artifactPath}" anchors nothing without symbolName or heading — give one or drop the path`,
    );
  }
  return null;
}

/**
 * Artifact sources come from the host (readArtifact) or the repo root. An
 * unreadable artifact becomes `undefined` — the honest-miss refusal downstream,
 * never a write without verification.
 */
function readSource(artifactPath: string, opts: RememberOptions): string | undefined {
  if (opts.readArtifact) return opts.readArtifact(artifactPath);
  if (opts.repoRoot === undefined) {
    throw new Error(`remember: anchoring "${artifactPath}" needs repoRoot, or an injected readArtifact`);
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
 */
function resolveAnchor(target: AnchorTarget, opts: RememberOptions): Anchor {
  const source = readSource(target.artifactPath, opts);
  if (source === undefined) {
    throw new Error(`remember: could not read artifact "${target.artifactPath}" — refusing to write an unanchored guess`);
  }

  if (target.strategy === "code") {
    if (!CODE_EXTENSIONS.has(extensionOf(target.artifactPath))) {
      throw new Error(`remember: no symbol locator strategy for "${target.artifactPath}" — symbolName anchors .ts/.tsx sources`);
    }
    const candidate = requireSingleMatch(
      extractSymbols(target.artifactPath, source).map((s) => ({ name: s.name, path: s.path, hash: s.hash })),
      target.symbolName,
      target.artifactPath,
      "symbol",
    );
    return { locator: candidate.path, hash: candidate.hash, artifactPath: target.artifactPath };
  }

  const candidate = requireSingleMatch(
    extractContentSpans(target.artifactPath, source).map((s) => ({ name: s.heading, path: s.path, hash: s.hash })),
    target.heading,
    target.artifactPath,
    "heading",
  );
  return { locator: candidate.path, hash: candidate.hash, artifactPath: target.artifactPath };
}

function requireSingleMatch(
  all: Candidate[],
  requested: string,
  artifactPath: string,
  noun: "symbol" | "heading",
): Candidate {
  const matches = all.filter((c) => c.name === requested);
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    const available = [...new Set(all.map((c) => c.name))];
    const listed = available.length > 0 ? available.join(", ") : "(none)";
    throw new Error(`remember: no ${noun} named "${requested}" in "${artifactPath}" — available ${noun}s: ${listed}`);
  }
  const paths = matches.map((m) => m.path).join("; ");
  throw new Error(
    `remember: ${noun} name "${requested}" is ambiguous in "${artifactPath}" (${matches.length} matches) — pick one: ${paths}`,
  );
}

function warningFor(conflict: Conflict, newId: string): string {
  const mine = conflict.invariantNode.id === newId ? conflict.invariantNode : conflict.defaultNode;
  const other = conflict.invariantNode.id === newId ? conflict.defaultNode : conflict.invariantNode;
  return `conflict advisory: "${newId}" (${mine.authority}) vs "${other.id}" (${other.authority}) on subject "${conflict.subject}" — both kept, nothing auto-resolved`;
}

/**
 * Capture: validate → resolve the anchor against the artifact's real source →
 * build via createNode → supersede in memory → collect conflict advisories →
 * persist through the writeNode choke-point. The never-leak gate stays inside
 * writeNode (nothing here re-implements or bypasses it); conflicts are
 * advisory only — they come back as `warnings` and never block a write.
 */
export function remember(
  memoryDir: string,
  nodes: readonly MemoryNode[],
  req: RememberRequest,
  opts: RememberOptions = {},
): { node: MemoryNode; superseded: MemoryNode | null; warnings: string[] } {
  const target = anchorTarget(req);

  const node = createNode({
    body: req.body,
    kind: req.kind,
    scope: req.scope ?? "global",
    authority: req.authority ?? "default",
    anchors: target ? [resolveAnchor(target, opts)] : [],
    // createNode's clock is real time; a deterministic one rides the same
    // explicit-values-win path.
    ...(opts.now !== undefined ? { validFrom: opts.now, txnTime: opts.now } : {}),
  });

  let finalNode = node;
  let superseded: MemoryNode | null = null;
  if (req.supersedes !== undefined) {
    const result = supersede(nodes, req.supersedes, node, { now: opts.now });
    superseded = result.old;
    finalNode = result.next;
  }

  const warnings = findConflicts([...nodes, finalNode])
    .filter((c) => c.invariantNode.id === finalNode.id || c.defaultNode.id === finalNode.id)
    .map((c) => warningFor(c, finalNode.id));

  // The new node lands first: if the gate refuses it, the old fact stands
  // untouched — a supersession never tears.
  writeNode(memoryDir, finalNode);
  if (superseded) writeNode(memoryDir, superseded);

  return { node: finalNode, superseded, warnings };
}
