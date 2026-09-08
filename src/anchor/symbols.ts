import { createHash } from "node:crypto";
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import type { SymbolInfo, SymbolKind } from "./types.js";
import type { SymbolLocator } from "./locator.js";

const parser = new Parser();
// Pass the whole Language wrapper (not just `.language`) — the JS runtime
// also reads `.nodeTypeInfo` off it to build per-type node subclasses.
parser.setLanguage(TypeScript.typescript as unknown as Parameters<typeof parser.setLanguage>[0]);

/** Path-segment separator for symbol locators (settled in PLAN.md). */
const SEP = " › ";

/**
 * Normalized content: comments stripped, runs of whitespace collapsed to a
 * single space, trimmed. This is what gets hashed — a line-move or a
 * comment/formatting-only edit must not change the hash; a body edit must.
 */
function normalizedSymbolText(node: Parser.SyntaxNode, source: string): string {
  const commentRanges: Array<[number, number]> = [];
  (function collect(n: Parser.SyntaxNode) {
    if (n.type === "comment") {
      commentRanges.push([n.startIndex, n.endIndex]);
      return;
    }
    for (const child of n.children) collect(child);
  })(node);
  commentRanges.sort((a, b) => a[0] - b[0]);

  let out = "";
  let cursor = node.startIndex;
  for (const [start, end] of commentRanges) {
    if (start > cursor) out += source.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  out += source.slice(cursor, node.endIndex);
  return out.replace(/\s+/g, " ").trim();
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function nameOf(node: Parser.SyntaxNode): string | null {
  const nameNode = node.childForFieldName("name");
  return nameNode ? nameNode.text : null;
}

function isExported(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === "export_statement";
}

/**
 * Enumerate stable-path symbols (functions, classes, methods, exported
 * top-level consts) from a TypeScript source file. Only top-level
 * declarations and class members are considered — no nested-function
 * extraction in this spike.
 */
export function extractSymbols(filePath: string, source: string): SymbolInfo[] {
  const tree = parser.parse(source);
  const symbols: SymbolInfo[] = [];

  function addSymbol(node: Parser.SyntaxNode, segments: string[], kind: SymbolKind, name: string): void {
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

  function visit(node: Parser.SyntaxNode, prefix: string[]): void {
    switch (node.type) {
      case "export_statement": {
        for (const child of node.namedChildren) {
          if (child.type !== "export_clause") visit(child, prefix);
        }
        return;
      }
      case "function_declaration": {
        const name = nameOf(node);
        if (name) addSymbol(node, [...prefix, `function ${name}`], "function", name);
        return;
      }
      case "class_declaration": {
        const name = nameOf(node);
        if (!name) return;
        const newPrefix = [...prefix, `class ${name}`];
        addSymbol(node, newPrefix, "class", name);
        const body = node.childForFieldName("body");
        if (body) {
          for (const member of body.namedChildren) {
            if (member.type === "method_definition") {
              const methodName = nameOf(member);
              if (methodName) addSymbol(member, [...newPrefix, `method ${methodName}`], "method", methodName);
            }
          }
        }
        return;
      }
      case "lexical_declaration": {
        // Only exported top-level `const` declarations are symbols (per plan).
        if (!isExported(node) || node.firstChild?.type !== "const") return;
        for (const declarator of node.namedChildren) {
          if (declarator.type !== "variable_declarator") continue;
          const nameNode = declarator.childForFieldName("name");
          if (nameNode?.type === "identifier") {
            addSymbol(node, [...prefix, `const ${nameNode.text}`], "const", nameNode.text);
          }
        }
        return;
      }
      default:
        return;
    }
  }

  for (const child of tree.rootNode.namedChildren) visit(child, []);
  return symbols;
}

/**
 * nocetta's default {@link SymbolLocator}: the built-in native tree-sitter
 * extractor above. Used everywhere unless a host injects its own locator.
 */
export const nativeLocator: SymbolLocator = { extractSymbols };
