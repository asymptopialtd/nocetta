import type { SymbolLocator } from "../anchor/index.js";
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
export type ReadArtifact = (artifactPath: string) => string | undefined;
/**
 * Classify one node. `readArtifact` supplies source text (the repo fs in the
 * CLI, injected in tests); `locator` defaults to nocetta's built-in parser.
 */
export declare function classify(node: MemoryNode, readArtifact: ReadArtifact, locator?: SymbolLocator): MemoryClass;
