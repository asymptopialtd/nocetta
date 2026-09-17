import { Language } from "web-tree-sitter";
export declare function initWasmRuntime(): Promise<void>;
/**
 * Load a grammar wasm under the shared runtime and validate it against a
 * parser before handing it back, so a bad load surfaces at startup with the
 * grammar's name instead of mid-parse.
 */
export declare function loadWasmLanguage(packagePath: string): Promise<Language>;
