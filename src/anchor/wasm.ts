import { createRequire } from "node:module";
import { Language, Parser } from "web-tree-sitter";

const require = createRequire(import.meta.url);

/**
 * One web-tree-sitter runtime for the whole process, initialized exactly
 * once. `Parser.init()` re-binds a process-global emscripten module on every
 * call, so per-backend init calls leave language objects pinned to a runtime
 * the global has already moved off — observed as intermittent
 * "Incompatible language version 0" at `setLanguage` under Node 26 whenever
 * two or more wasm backends loaded in one process. Every wasm backend
 * awaits this module's init (a memoized promise, so the runtime binds once
 * regardless of import order) and loads its grammar through
 * {@link loadWasmLanguage}.
 */
let runtime: Promise<void> | null = null;

export function initWasmRuntime(): Promise<void> {
  runtime ??= Parser.init({
    locateFile: () => require.resolve("web-tree-sitter/tree-sitter.wasm"),
  });
  return runtime;
}

/**
 * Load a grammar wasm under the shared runtime and validate it against a
 * parser before handing it back, so a bad load surfaces at startup with the
 * grammar's name instead of mid-parse.
 */
export async function loadWasmLanguage(packagePath: string): Promise<Language> {
  await initWasmRuntime();
  const language = await Language.load(require.resolve(packagePath));
  const parser = new Parser();
  parser.setLanguage(language);
  parser.delete();
  return language;
}
