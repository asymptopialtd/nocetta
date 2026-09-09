/**
 * Function words and generic adjectives: they bind sentences together but
 * carry no subject identity ("for", "new", "before" — a collision on these is
 * not evidence two beliefs are about the same thing). Shared by the conflict
 * gate and the contradiction flagger; negation words are deliberately NOT
 * stripped — the flagger reads them from raw text, not from tokens.
 */
export const STOPWORDS = new Set([
  // articles, conjunctions, prepositions
  "a", "an", "the", "and", "or", "nor", "but", "so", "if", "then", "than", "as",
  "at", "by", "for", "from", "in", "into", "of", "off", "on", "onto", "out", "over", "under",
  "to", "with", "within", "without", "about", "against", "between", "through", "during",
  "before", "after", "above", "below", "up", "down",
  // pronouns and determiners
  "i", "he", "she", "it", "its", "we", "they", "them", "their", "you", "your",
  "this", "that", "these", "those", "what", "which", "who", "all", "any", "both", "each",
  // verbs that name no subject
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "do", "does", "did", "done",
  "will", "would", "can", "could", "may", "might", "shall", "should", "must",
  // time and degree words, generic adjectives
  "now", "when", "where", "while", "once", "here", "there", "then",
  "only", "just", "also", "very", "too", "not", "no",
  "new", "old", "existing", "first", "last", "next", "own", "same", "other",
  "more", "most", "less", "least", "best", "better",
]);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** The words that could name a subject — stopwords stripped. The conflict
 * gate weighs these by document frequency (a word most beliefs use names the
 * domain, not a subject); the raw set is the shared source of "subject word". */
export function significantTokens(text: string): Set<string> {
  return new Set(tokenize(text).filter((t) => !STOPWORDS.has(t)));
}
