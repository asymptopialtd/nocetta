/** Path-segment separator for symbol locators (settled in PLAN.md). */
export declare const SEP = " \u203A ";
/**
 * The structural slice of a tree-sitter node the hasher needs. Both parser
 * backends satisfy it: web-tree-sitter's `Node` (TypeScript/JavaScript) and
 * node-tree-sitter's `SyntaxNode` (GDScript). Keeping the hash logic in one
 * place — off both concrete node types — is what guarantees the two grammars
 * produce the same hash format, so a locator string stays one format across
 * languages.
 */
export interface HashNode {
    readonly type: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly children: readonly (HashNode | null)[];
}
/**
 * Normalized content: comments stripped, runs of whitespace collapsed to a
 * single space, trimmed. This is what gets hashed — a line-move or a
 * comment/formatting-only edit must not change the hash; a body edit must.
 */
export declare function normalizedSymbolText(node: HashNode, source: string): string;
export declare function hashOf(text: string): string;
