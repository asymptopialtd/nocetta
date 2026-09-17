import { Parser } from "web-tree-sitter";
import { SEP, hashOf, normalizedSymbolText } from "./symbol-hash.js";
import { loadWasmLanguage } from "./wasm.js";
/**
 * Python parser backend: `web-tree-sitter` (WASM), the same portable path the
 * TypeScript/JavaScript grammars ride — the grammar ships a prebuilt
 * `tree-sitter-python.wasm`, so no native build is needed. The shared runtime
 * (wasm.ts) binds once per process; init still runs at module load via
 * top-level await, keeping {@link extractPythonSymbols} synchronous for
 * callers, matching symbols.ts.
 */
const language = await loadWasmLanguage("tree-sitter-python/tree-sitter-python.wasm");
const parser = new Parser();
parser.setLanguage(language);
function nameOf(node) {
    const nameNode = node.childForFieldName("name");
    return nameNode ? nameNode.text : null;
}
/**
 * The uppercase name of a module- or class-level constant assignment, or null.
 * Python has no `const` keyword, so ALL_CAPS is the convention that marks a
 * binding as a stable constant (mirroring how the TS extractor takes `const`
 * but skips mutable `let`). A lowercase module variable is mutable by
 * convention and left unanchored — indexing every assignment would over-index.
 */
function constNameOf(exprStmt) {
    const assignment = exprStmt.namedChildren.find((c) => c?.type === "assignment") ?? null;
    const left = assignment?.childForFieldName("left");
    if (left?.type !== "identifier")
        return null;
    return /^[A-Z][A-Z0-9_]*$/.test(left.text) ? left.text : null;
}
/**
 * Enumerate stable-path symbols from a Python source file: top-level
 * functions, classes (with their methods and ALL_CAPS class constants), and
 * module-level ALL_CAPS constants. A decorated function or class is unwrapped
 * to the definition it wraps and anchored there — so its span excludes the
 * decorators, and adding one does not change the hash, mirroring how the TS
 * extractor anchors the declaration inside an `export`. The locator segments —
 * `function foo`, `class Foo`, `method bar`, `const FOO` — match the TS format
 * exactly, so a `.py` anchor reads like any other.
 */
export function extractPythonSymbols(filePath, source) {
    const tree = parser.parse(source);
    if (!tree)
        return [];
    const symbols = [];
    function addSymbol(node, segments, kind, name) {
        symbols.push({
            path: [filePath, ...segments].join(SEP),
            kind,
            name,
            hash: hashOf(normalizedSymbolText(node, source)),
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            startPosition: node.startPosition,
            endPosition: node.endPosition,
        });
    }
    /** The definition a `decorated_definition` wraps, else the node itself. */
    function undecorate(node) {
        if (node.type !== "decorated_definition")
            return node;
        return node.childForFieldName("definition") ?? node;
    }
    function visit(node, prefix) {
        const def = undecorate(node);
        switch (def.type) {
            case "function_definition": {
                const name = nameOf(def);
                if (name)
                    addSymbol(def, [...prefix, `function ${name}`], "function", name);
                return;
            }
            case "class_definition": {
                const name = nameOf(def);
                if (!name)
                    return;
                const newPrefix = [...prefix, `class ${name}`];
                addSymbol(def, newPrefix, "class", name);
                const body = def.childForFieldName("body");
                if (!body)
                    return;
                for (const member of body.namedChildren) {
                    if (!member)
                        continue;
                    const memberDef = undecorate(member);
                    if (memberDef.type === "function_definition") {
                        const methodName = nameOf(memberDef);
                        if (methodName)
                            addSymbol(memberDef, [...newPrefix, `method ${methodName}`], "method", methodName);
                    }
                    else if (member.type === "expression_statement") {
                        const constName = constNameOf(member);
                        if (constName)
                            addSymbol(member, [...newPrefix, `const ${constName}`], "const", constName);
                    }
                }
                return;
            }
            case "expression_statement": {
                const constName = constNameOf(def);
                if (constName)
                    addSymbol(def, [...prefix, `const ${constName}`], "const", constName);
                return;
            }
            default:
                return;
        }
    }
    for (const child of tree.rootNode.namedChildren)
        if (child)
            visit(child, []);
    return symbols;
}
