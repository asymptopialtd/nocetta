/**
 * Frontmatter-shape validation for a node read off disk. Returns one
 * human-readable reason per problem, empty when well-formed. Files are truth,
 * so hand-edits are the norm rather than corruption: the reasons are written
 * for the human fixing the file — they name the field and quote the offending
 * value — and the validator never attempts repair or recovery.
 */
export declare function validateNode(node: unknown): string[];
