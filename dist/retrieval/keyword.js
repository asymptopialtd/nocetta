function tokenize(text) {
    return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}
const K1 = 1.5;
const B = 0.75;
/**
 * Hand-rolled BM25 over node bodies (no library — this is a few dozen lines
 * over a handful of documents, not worth a dependency for the spike). A
 * second candidate-gen source feeding the same resolve/filter/rank/budget
 * stages as the anchor reverse-index (Slice 4).
 */
export function candidatesFromKeyword(nodes, query) {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0)
        return [];
    const docs = nodes.map((node) => ({ node, terms: tokenize(node.body) }));
    const N = docs.length;
    if (N === 0)
        return [];
    const avgdl = docs.reduce((sum, d) => sum + d.terms.length, 0) / N;
    const docFreq = new Map();
    for (const term of new Set(queryTerms)) {
        docFreq.set(term, docs.filter((d) => d.terms.includes(term)).length);
    }
    const candidates = [];
    for (const doc of docs) {
        const termFreq = new Map();
        for (const t of doc.terms)
            termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
        let score = 0;
        for (const term of queryTerms) {
            const n = docFreq.get(term) ?? 0;
            const f = termFreq.get(term) ?? 0;
            if (n === 0 || f === 0)
                continue;
            const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
            const denom = f + K1 * (1 - B + (B * doc.terms.length) / avgdl);
            score += idf * ((f * (K1 + 1)) / denom);
        }
        if (score > 0) {
            candidates.push({ node: doc.node, matchedFiles: new Set(), keywordScore: score });
        }
    }
    return candidates;
}
