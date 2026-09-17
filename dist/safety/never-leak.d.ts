import type { MemoryNode } from "../store/types.js";
/** Scan a memory node for obvious secrets before it's ever written. Returns
 * human-readable violation reasons; empty means clean. */
export declare function scanForSecrets(node: MemoryNode): string[];
