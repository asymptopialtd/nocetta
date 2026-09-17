/**
 * Function words and generic adjectives: they bind sentences together but
 * carry no subject identity ("for", "new", "before" — a collision on these is
 * not evidence two beliefs are about the same thing). Shared by the conflict
 * gate and the contradiction flagger; negation words are deliberately NOT
 * stripped — the flagger reads them from raw text, not from tokens.
 */
export declare const STOPWORDS: Set<string>;
export declare function tokenize(text: string): string[];
/** The words that could name a subject — stopwords stripped. The conflict
 * gate weighs these by document frequency (a word most beliefs use names the
 * domain, not a subject); the raw set is the shared source of "subject word". */
export declare function significantTokens(text: string): Set<string>;
