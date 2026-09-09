import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { Language, Parser, type Node } from "web-tree-sitter";
import type { SymbolInfo, SymbolKind } from "./types.js";
import type { SymbolLocator } from "./locator.js";

/**
 * Parser backend: `web-tree-sitter` (WASM). No native build — one portable
 * grammar runs everywhere (Node, browser, edge). The one-time async init
 * (load the runtime + TypeScript grammar wasm) happens at module load via
 * top-level await, so `extractSymbols` stays synchronous for callers.
 *
 * Assets are resolved from this package's own dependencies, so nocetta works
 * standalone with no configuration. A host that wants a single shared parser
 * injects its own {@link SymbolLocator} instead (see `locator.ts`).
 */
const require = createRequire(import.meta.url);
await Parser.init({
  locateFile: () => require.resolve("web-tree-sitter/tree-sitter.wasm"),
});
const language = await Language.load(require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"));
const parser = new Parser();
parser.setLanguage(language);

/** Path-segment separator for symbol locators (settled in PLAN.md). */
const SEP = " › ";

/**
 * Normalized content: comments stripped, runs of whitespace collapsed to a
 * single space, trimmed. This is what gets hashed — a line-move or a
 * comment/formatting-only edit must not change the hash; a body edit must.
 */
function normalizedSymbolText(node: Node, source: string): string {
  const commentRanges: Array<[number, number]> = [];
  (function collect(n: Node) {
    if (n.type === "comment") {
      commentRanges.push([n.startIndex, n.endIndex]);
      return;
    }
    for (const child of n.children) if (child) collect(child);
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

function nameOf(node: Node): string | null {
  const nameNode = node.childForFieldName("name");
  return nameNode ? nameNode.text : null;
}

/**
 * Enumerate stable-path symbols (functions, classes, methods, top-level
 * consts — exported or not) from a TypeScript source file. Only top-level
 * declarations and class members are considered — no nested-function
 * extraction in this spike.
 */
export function extractSymbols(filePath: string, source: string): SymbolInfo[] {
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

  function visit(node: Node, prefix: string[]): void {
    switch (node.type) {
      case "export_statement": {
        for (const child of node.namedChildren) {
          if (child && child.type !== "export_clause") visit(child, prefix);
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
            if (member && member.type === "method_definition") {
              const methodName = nameOf(member);
              if (methodName) addSymbol(member, [...newPrefix, `method ${methodName}`], "method", methodName);
            }
          }
        }
        return;
      }
      case "lexical_declaration": {
        // Top-level `const` declarations are symbols, exported or not — a
        // file-local config array/lookup table can be anchored too. `let`
        // stays unindexed (mutable, not a stable subject to anchor to), and
        // `visit` only ever runs on top-level nodes, so nested-scope consts
        // (inside a function body) are never reached here.
        if (node.firstChild?.type !== "const") return;
        for (const declarator of node.namedChildren) {
          if (!declarator || declarator.type !== "variable_declarator") continue;
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

  for (const child of tree.rootNode.namedChildren) if (child) visit(child, []);
  return symbols;
}

/**
 * nocetta's default {@link SymbolLocator}: the built-in WASM tree-sitter
 * extractor above. Used everywhere unless a host injects its own locator.
 */
export const defaultLocator: SymbolLocator = { extractSymbols };
