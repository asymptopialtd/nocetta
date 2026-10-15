#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * The stdio MCP server over one facade: the loop (capture → recall → drift →
 * repair) is entirely the facade's; this module only shapes the door — six
 * tools, which is the cap. The SDK converts a handler throw into an
 * { isError: true, text: message } result, so the facade's honest refusals
 * (ambiguous symbol, never-leak, unknown id) reach the agent verbatim, never
 * as stack traces (light 5).
 *
 * The one prompt (`onboard`) is off the six-tool cap on purpose: it is a
 * once-per-project seeding protocol, invoked on demand, not a per-session tool
 * — so it delivers a payload the always-present INSTRUCTIONS must never carry.
 *
 * The store is resolved PER CALL, not once at launch (router.ts): a server
 * launched at a parent of many project repos still routes each belief to the
 * right project's `.nocetta/`. A bare string argument forces that single root
 * (the single-project launch and the test contract); the options form wires
 * the per-write router, including the client's advertised workspace roots.
 */
export declare function createNocettaServer(config: string | {
    base?: string;
    override?: string;
}): McpServer;
/** The store is discovered per write, not declared (router.ts): NOCETTA_ROOT
 * forces one root when set, otherwise each call routes from its own artifact
 * path or the MCP client's advertised workspace roots, with the launch cwd as
 * the base for relative paths and the discovery fallback. */
export declare function main(): Promise<void>;
