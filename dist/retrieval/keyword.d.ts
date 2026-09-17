import type { MemoryNode } from "../store/types.js";
import type { Candidate } from "./types.js";
/**
 * Hand-rolled BM25 over node bodies (no library — this is a few dozen lines
 * over a handful of documents, not worth a dependency for the spike). A
 * second candidate-gen source feeding the same resolve/filter/rank/budget
 * stages as the anchor reverse-index (Slice 4).
 */
export declare function candidatesFromKeyword(nodes: MemoryNode[], query: string): Candidate[];
