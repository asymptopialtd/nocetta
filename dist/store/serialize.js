import yaml from "js-yaml";
const DELIM = "---";
/** Markdown file body: YAML frontmatter delimited by `---` lines, then prose body. */
export function serializeNode(node) {
    const { body, ...frontmatter } = node;
    const yamlText = yaml.dump(frontmatter, { sortKeys: false, lineWidth: -1 });
    return `${DELIM}\n${yamlText}${DELIM}\n\n${body.trim()}\n`;
}
export function parseNode(text) {
    const lines = text.split("\n");
    if (lines[0] !== DELIM) {
        throw new Error("malformed memory file: missing opening frontmatter delimiter");
    }
    const closeIdx = lines.indexOf(DELIM, 1);
    if (closeIdx === -1) {
        throw new Error("malformed memory file: missing closing frontmatter delimiter");
    }
    const yamlText = lines.slice(1, closeIdx).join("\n");
    const body = lines
        .slice(closeIdx + 1)
        .join("\n")
        .trim();
    const frontmatter = (yaml.load(yamlText) ?? {});
    return { ...normalizeTimestamps(frontmatter), body };
}
/**
 * YAML 1.1 types an unquoted ISO timestamp as a Date — correct YAML, but the
 * node model stores strings, and hand-edited files (the norm, not corruption)
 * leave timestamps unquoted. Normalize at the parse boundary so a Date from
 * disk and a string from serializeNode are the same instant in the same type;
 * without this, unquoted timestamps flowed through as Dates and every date
 * comparison silently misbehaved.
 */
function normalizeTimestamps(frontmatter) {
    const out = { ...frontmatter };
    for (const field of ["validFrom", "validTo", "txnTime"]) {
        const value = out[field]; // YAML's timestamp type is a Date; the declared type lies
        if (value instanceof Date) {
            out[field] = value.toISOString();
        }
    }
    return out;
}
