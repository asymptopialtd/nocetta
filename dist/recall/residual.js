import { defaultLocator } from "../anchor/index.js";
import { significantTokens } from "../text/tokens.js";
/** Fraction of the body's subject words absent from the anchored source, at or
 * above which the body is judged to add real knowledge. Tuned high on purpose
 * (see the type doc). A tunable heuristic, not a proof — the ledger is a
 * report, so a misclassification costs a mislabel, never a lost belief. */
const NOVELTY_FOR_COMPLEMENT = 0.5;
/**
 * Classify one node. `readArtifact` supplies source text (the repo fs in the
 * CLI, injected in tests); `locator` defaults to nocetta's built-in parser.
 */
export function classify(node, readArtifact, locator = defaultLocator) {
    const sources = codeAnchorSources(node, readArtifact, locator);
    if (sources.length === 0)
        return "complement"; // nothing code-anchored to be covered by
    const sourceTokens = new Set();
    for (const source of sources)
        for (const token of significantTokens(source))
            sourceTokens.add(token);
    const bodyTokens = [...significantTokens(node.body)];
    if (bodyTokens.length === 0)
        return "complement";
    const novel = bodyTokens.filter((token) => !sourceTokens.has(token)).length / bodyTokens.length;
    return novel >= NOVELTY_FOR_COMPLEMENT ? "complement" : "covered";
}
/**
 * The source text of each code anchor that still resolves — the exact span of
 * the anchored symbol, sliced from the current file. Doc (content) anchors and
 * unresolvable ones contribute nothing: their locators never match a code
 * symbol path, so they fall through to the empty-sources → complement case.
 */
function codeAnchorSources(node, readArtifact, locator) {
    const out = [];
    for (const anchor of node.anchors) {
        const source = readArtifact(anchor.artifactPath);
        if (source === undefined)
            continue;
        let symbols;
        try {
            symbols = locator.extractSymbols(anchor.artifactPath, source);
        }
        catch {
            continue; // a parser miss is not evidence of coverage
        }
        const symbol = symbols.find((s) => s.path === anchor.locator);
        if (symbol)
            out.push(source.slice(symbol.startIndex, symbol.endIndex));
    }
    return out;
}
