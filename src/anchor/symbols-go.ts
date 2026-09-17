import { Parser, type Node } from "web-tree-sitter";
import { SEP, hashOf, normalizedSymbolText } from "./symbol-hash.js";
import type { SymbolInfo, SymbolKind } from "./types.js";
import { loadWasmLanguage } from "./wasm.js";

/**
 * Go parser backend: `web-tree-sitter` (WASM), the same portable path the
 * TypeScript/JavaScript grammars ride — the grammar ships a prebuilt
 * `tree-sitter-go.wasm`, so no native build is needed. The shared runtime
 * (wasm.ts) binds once per process; init still runs at module load via
 * top-level await, keeping {@link extractGoSymbols} synchronous for callers,
 * matching symbols.ts.
 */
const language = await loadWasmLanguage("tree-sitter-go/tree-sitter-go.wasm");
const parser = new Parser();
parser.setLanguage(language);

function nameOf(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  return nameNode ? nameNode.text : null;
}

/**
 * The name of the type a method is declared on, from its receiver — `Point`
 * for both `(p Point)` and `(p *Point)`. Methods live at Go's top level rather
 * than inside a type body, so grouping them under a `type <T>` segment gives
 * the same nested locator shape a class member has in TS or GDScript, and puts
 * a method beside its type's own `type <T>` symbol.
 */
function receiverTypeName(method: Node): string | null {
  const receiver = method.childForFieldName("receiver");
  if (!receiver) return null;
  const typeId = receiver.descendantsOfType("type_identifier")[0];
  return typeId ? typeId.text : null;
}

/**
 * Enumerate stable-path symbols from a Go source file: top-level functions,
 * methods (grouped under their receiver type), type declarations (structs,
 * interfaces, aliases — kind `class`, the nearest named-type subject), and
 * top-level consts. Mutable `var` declarations stay unindexed, mirroring how
 * the TS extractor skips `let`. The locator segments — `function foo`,
 * `type Foo`, `method bar`, `const FOO` — carry Go's own `type` keyword but
 * share the SEP-joined format, so a `.go` anchor relocates like any other.
 */
export function extractGoSymbols(filePath: string, source: string): SymbolInfo[] {
  const tree = parser.parse(source);
  if (!tree) return [];
  const symbols: SymbolInfo[] = [];

  function addSymbol(node: Node, segments: string[], kind: SymbolKind, name: string): void {
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
    if (!node) continue;
    switch (node.type) {
      case "function_declaration": {
        const name = nameOf(node);
        if (name) addSymbol(node, [`function ${name}`], "function", name);
        break;
      }
      case "method_declaration": {
        const name = nameOf(node);
        if (!name) break;
        const typeName = receiverTypeName(node);
        const segments = typeName ? [`type ${typeName}`, `method ${name}`] : [`method ${name}`];
        addSymbol(node, segments, "method", name);
        break;
      }
      case "type_declaration": {
        // `type ( ... )` groups several specs; a single `type Foo …` has one.
        for (const spec of node.namedChildren) {
          if (spec?.type !== "type_spec" && spec?.type !== "type_alias") continue;
          const name = nameOf(spec);
          if (name) addSymbol(spec, [`type ${name}`], "class", name);
        }
        break;
      }
      case "const_declaration": {
        for (const spec of node.namedChildren) {
          if (spec?.type !== "const_spec") continue;
          // `const a, b = 1, 2` puts several names in one spec; iterate them.
          for (const nameNode of spec.childrenForFieldName("name")) {
            if (nameNode?.type === "identifier") addSymbol(spec, [`const ${nameNode.text}`], "const", nameNode.text);
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
