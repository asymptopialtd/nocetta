import { z } from "zod";
import type { Nocetta } from "../facade/open.js";
export interface ToolDef {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: z.ZodRawShape;
    /** Synchronous by discipline: every tool is a pure function of files + repo
     * state (light 1). A thrown error reaches the agent as isError text with the
     * message verbatim — the SDK's tool handler owns that conversion. */
    run(nc: Nocetta, raw: unknown): string;
}
/**
 * The six-tool cap (Seam 5) lives here as data: new capability folds into an
 * existing entry before a seventh is added. Descriptions are the intuitive UX
 * — each is self-sufficient, with one example, for an agent deciding when to
 * call. Field names are snake_case, the MCP convention agents see everywhere.
 */
export declare const TOOLS: readonly ToolDef[];
