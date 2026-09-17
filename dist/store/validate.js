const KINDS = new Set(["claim", "value", "entity", "lore-fact"]);
const AUTHORITIES = new Set(["invariant", "default"]);
const EDGE_TYPES = new Set(["anchored-to", "superseded-by", "supersedes", "restates"]);
// Shape first, then parseability: Date.parse alone accepts loose English forms
// ("Jan 1, 2026"), and the shape check is what rejects them. Impossible months
// ("2026-13-01") then fail the parse. An overflow day ("2026-02-31") rolls
// forward silently — accepted, an obscure enough hand-edit not to armor
// against.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?([Zz]|[+-]\d{2}:?\d{2})?)?$/;
function isIsoTimestamp(value) {
    return typeof value === "string" && ISO_8601.test(value) && !Number.isNaN(Date.parse(value));
}
function typeName(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "array";
    return typeof value;
}
function isMapping(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checkAnchor(value, index, reasons) {
    if (!isMapping(value)) {
        reasons.push(`anchor ${index} is not a key-value mapping (got ${typeName(value)})`);
        return;
    }
    for (const field of ["locator", "hash", "artifactPath"]) {
        const v = value[field];
        if (v === undefined)
            reasons.push(`anchor ${index}: missing ${field}`);
        else if (typeof v !== "string" || v.length === 0)
            reasons.push(`anchor ${index}: ${field} must be a non-empty string`);
    }
}
function checkEdge(value, index, reasons) {
    if (!isMapping(value)) {
        reasons.push(`edge ${index} is not a key-value mapping (got ${typeName(value)})`);
        return;
    }
    if (value.type === undefined)
        reasons.push(`edge ${index}: missing type`);
    else if (typeof value.type !== "string")
        reasons.push(`edge ${index}: type must be a string`);
    else if (!EDGE_TYPES.has(value.type))
        reasons.push(`edge ${index}: unknown type: ${JSON.stringify(value.type)}`);
    const target = value.target;
    if (target === undefined)
        reasons.push(`edge ${index}: missing target`);
    else if (typeof target !== "string" || target.length === 0)
        reasons.push(`edge ${index}: target must be a non-empty string`);
}
/**
 * Frontmatter-shape validation for a node read off disk. Returns one
 * human-readable reason per problem, empty when well-formed. Files are truth,
 * so hand-edits are the norm rather than corruption: the reasons are written
 * for the human fixing the file — they name the field and quote the offending
 * value — and the validator never attempts repair or recovery.
 */
export function validateNode(node) {
    if (!isMapping(node))
        return [`frontmatter is not a key-value mapping (got ${typeName(node)})`];
    const fm = node;
    const reasons = [];
    if (fm.id === undefined)
        reasons.push("missing required field: id");
    else if (typeof fm.id !== "string" || fm.id.length === 0)
        reasons.push("id must be a non-empty string");
    if (fm.kind === undefined)
        reasons.push("missing required field: kind");
    else if (typeof fm.kind !== "string")
        reasons.push(`kind must be a string (got ${typeName(fm.kind)})`);
    else if (!KINDS.has(fm.kind))
        reasons.push(`unknown kind: ${JSON.stringify(fm.kind)}`);
    if (fm.scope === undefined)
        reasons.push("missing required field: scope");
    else if (typeof fm.scope !== "string" || fm.scope.length === 0)
        reasons.push("scope must be a non-empty string");
    if (fm.anchors === undefined)
        reasons.push("missing required field: anchors");
    else if (!Array.isArray(fm.anchors))
        reasons.push(`anchors must be an array (got ${typeName(fm.anchors)})`);
    else
        fm.anchors.forEach((anchor, i) => checkAnchor(anchor, i, reasons));
    if (fm.edges === undefined)
        reasons.push("missing required field: edges");
    else if (!Array.isArray(fm.edges))
        reasons.push(`edges must be an array (got ${typeName(fm.edges)})`);
    else
        fm.edges.forEach((edge, i) => checkEdge(edge, i, reasons));
    for (const field of ["validFrom", "txnTime"]) {
        if (fm[field] === undefined)
            reasons.push(`missing required field: ${field}`);
        else if (!isIsoTimestamp(fm[field]))
            reasons.push(`${field} is not an ISO-8601 timestamp: ${JSON.stringify(fm[field])}`);
    }
    if (fm.validTo === undefined)
        reasons.push("missing required field: validTo");
    else if (fm.validTo !== null && !isIsoTimestamp(fm.validTo)) {
        reasons.push(`validTo must be null or an ISO-8601 timestamp: ${JSON.stringify(fm.validTo)}`);
    }
    if (fm.authority === undefined)
        reasons.push("missing required field: authority");
    else if (typeof fm.authority !== "string")
        reasons.push(`authority must be a string (got ${typeName(fm.authority)})`);
    else if (!AUTHORITIES.has(fm.authority))
        reasons.push(`unknown authority: ${JSON.stringify(fm.authority)}`);
    if (fm.overrideReason === undefined)
        reasons.push("missing required field: overrideReason");
    else if (fm.overrideReason !== null && typeof fm.overrideReason !== "string") {
        reasons.push(`overrideReason must be a string or null (got ${typeName(fm.overrideReason)})`);
    }
    if (fm.body === undefined)
        reasons.push("missing required field: body");
    else if (typeof fm.body !== "string")
        reasons.push(`body must be a string (got ${typeName(fm.body)})`);
    if (fm.version !== undefined && typeof fm.version !== "number") {
        reasons.push(`version must be a number (got ${JSON.stringify(fm.version)})`);
    }
    if (fm.summary !== undefined && typeof fm.summary !== "string") {
        reasons.push(`summary must be a string (got ${typeName(fm.summary)})`);
    }
    if (fm.commit !== undefined && typeof fm.commit !== "string") {
        reasons.push(`commit must be a string (got ${typeName(fm.commit)})`);
    }
    if (fm.aliases !== undefined && (!Array.isArray(fm.aliases) || fm.aliases.some((alias) => typeof alias !== "string"))) {
        reasons.push("aliases must be an array of strings");
    }
    return reasons;
}
