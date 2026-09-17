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
 */
export declare function createNocettaServer(repoRoot: string): McpServer;
/** The repo root is discovered, not declared (facade/root.ts): NOCETTA_ROOT
 * when the host launches the server outside the repo, else cwd (the usual case
 * — an MCP client starts the server inside the project it's remembering for). */
export declare function main(): Promise<void>;
