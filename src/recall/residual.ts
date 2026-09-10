import { defaultLocator } from "../anchor/index.js";
import type { SymbolLocator } from "../anchor/index.js";
import { significantTokens } from "../text/tokens.js";
import type { MemoryNode } from "../store/types.js";

/**
 * How a memory relates to the code it is anchored to — the axis that separates
 * a memory worth keeping from one the source already tells you:
 *
 * - `covered`: the anchored code already says what the body says. Reading the
 *   file would recover it, so the memory adds little.
 * - `complement`: the body carries knowledge the code cannot — a decision, a
 *   why, project vocabulary, a cross-system fact.
 *
 * Every value/entity/lore-fact is a complement by nature (no code restates a
 * decision), and a doc-anchored fact has no code span to be covered by; only a
 * code-anchored claim can be `covered`, and only when its prose barely exceeds
 * the symbol it restates. That asymmetry is deliberate — nocetta's own capture
 * shape (a lead sentence then Why/How rationale) makes genuine complements the
 * common case, so `covered` should fire rarely and only for prose that truly
 * re-describes the source.
 */
export type MemoryClass = "covered" | "complement";

/** Fraction of the body's subject words absent from the anchored source, at or
 * above which the body is judged to add real knowledge. Tuned high on purpose
 * (see the type doc). A tunable heuristic, not a proof — the ledger is a
 * report, so a misclassification costs a mislabel, never a lost belief. */
const NOVELTY_FOR_COMPLEMENT = 0.5;

export type ReadArtifact = (artifactPath: string) => string | undefined;

/**
 * Classify one node. `readArtifact` supplies source text (the repo fs in the
 * CLI, injected in tests); `locator` defaults to nocetta's built-in parser.
 */
export function classify(
  node: MemoryNode,
  readArtifact: ReadArtifact,
  locator: SymbolLocator = defaultLocator,
): MemoryClass {
  const sources = codeAnchorSources(node, readArtifact, locator);
  if (sources.length === 0) return "complement"; // nothing code-anchored to be covered by
  const sourceTokens = new Set<string>();
  for (const source of sources) for (const token of significantTokens(source)) sourceTokens.add(token);
  const bodyTokens = [...significantTokens(node.body)];
  if (bodyTokens.length === 0) return "complement";
  const novel = bodyTokens.filter((token) => !sourceTokens.has(token)).length / bodyTokens.length;
  return novel >= NOVELTY_FOR_COMPLEMENT ? "complement" : "covered";
}

/**
 * The source text of each code anchor that still resolves — the exact span of
 * the anchored symbol, sliced from the current file. Doc (content) anchors and
 * unresolvable ones contribute nothing: their locators never match a code
 * symbol path, so they fall through to the empty-sources → complement case.
 */
function codeAnchorSources(node: MemoryNode, readArtifact: ReadArtifact, locator: SymbolLocator): string[] {
  const out: string[] = [];
  for (const anchor of node.anchors) {
    const source = readArtifact(anchor.artifactPath);
    if (source === undefined) continue;
    let symbols;
    try {
      symbols = locator.extractSymbols(anchor.artifactPath, source);
    } catch {
      continue; // a parser miss is not evidence of coverage
    }
    const symbol = symbols.find((s) => s.path === anchor.locator);
    if (symbol) out.push(source.slice(symbol.startIndex, symbol.endIndex));
  }
  return out;
}
