import { createRequire } from "node:module";
import Parser from "tree-sitter";
import { SEP, hashOf, normalizedSymbolText } from "./symbol-hash.js";
/**
 * GDScript parser backend: `node-tree-sitter` (native binding), not the wasm
 * path the TS/JS grammars ride. The only maintained tree-sitter GDScript
 * grammar ships as a native `.node` addon with no wasm build, so anchoring
 * Godot code means a native dependency here — a deliberate exception to the
 * "one portable wasm grammar" rule, taken with He (2026-09-09) after the first
 * non-TS/JS dogfood was a Godot project and every `.gd` claim fell back to
 * unanchored. The grammar loads via createRequire (it has no type
 * declarations, and native addons resolve through CJS require), matching how
 * symbols.ts resolves its wasm asset.
 */
const require = createRequire(import.meta.url);
const GDScript = require("tree-sitter-gdscript");
const parser = new Parser();
parser.setLanguage(GDScript);
function nameOf(node) {
    const nameNode = node.childForFieldName("name");
    return nameNode ? nameNode.text : null;
}
/**
 * Enumerate stable-path symbols from a GDScript source file: top-level
 * functions, consts, and the file's `class_name`, plus inner `class`
 * definitions with their methods and consts. Mutable `var` stays unindexed
 * (not a stable subject, mirroring how the TS extractor skips `let`). The
 * locator segments — `function foo`, `const FOO`, `class Foo`, `method bar` —
 * match the TS format exactly, so a `.gd` anchor reads like any other.
 */
export function extractGdscriptSymbols(filePath, source) {
    const tree = parser.parse(source);
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
    for (const node of tree.rootNode.namedChildren) {
        switch (node.type) {
            // `class_name Foo` names the whole script's class. Coarse by nature —
            // its span is the declaration line, so it detects a rename, not a body
            // edit — but it is the identifier a Godot author reaches for first.
            case "class_name_statement": {
                const name = nameOf(node);
                if (name)
                    addSymbol(node, [`class ${name}`], "class", name);
                break;
            }
            case "function_definition": {
                const name = nameOf(node);
                if (name)
                    addSymbol(node, [`function ${name}`], "function", name);
                break;
            }
            case "const_statement": {
                const name = nameOf(node);
                if (name)
                    addSymbol(node, [`const ${name}`], "const", name);
                break;
            }
            case "class_definition": {
                const name = nameOf(node);
                if (!name)
                    break;
                const prefix = [`class ${name}`];
                addSymbol(node, prefix, "class", name);
                const body = node.namedChildren.find((c) => c.type === "class_body");
                if (body) {
                    for (const member of body.namedChildren) {
                        if (member.type === "function_definition") {
                            const methodName = nameOf(member);
                            if (methodName)
                                addSymbol(member, [...prefix, `method ${methodName}`], "method", methodName);
                        }
                        else if (member.type === "const_statement") {
                            const constName = nameOf(member);
                            if (constName)
                                addSymbol(member, [...prefix, `const ${constName}`], "const", constName);
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
    }
    return symbols;
}
