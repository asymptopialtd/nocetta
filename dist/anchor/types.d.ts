export type SymbolKind = "function" | "class" | "method" | "const" | "content-span";
/** A symbol enumerated from a parsed source file: its stable path, kind, and
 * normalized content hash at the moment of extraction. */
export interface SymbolInfo {
    /** e.g. "src/foo.ts › class Foo › method bar" */
    path: string;
    kind: SymbolKind;
    name: string;
    hash: string;
    startIndex: number;
    endIndex: number;
    startPosition: {
        row: number;
        column: number;
    };
    endPosition: {
        row: number;
        column: number;
    };
}
/** (stable locator, content hash) pair anchoring a memory node to a code artifact. */
export interface Anchor {
    locator: string;
    hash: string;
    artifactPath: string;
}
export interface LocateResult {
    found: boolean;
    /** true iff found and the live hash differs from the anchor's stored hash. */
    hashChanged: boolean;
    symbol?: SymbolInfo;
}
