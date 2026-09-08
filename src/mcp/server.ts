#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { open } from "../facade/open.js";
import { TOOLS } from "./tools.js";

const SERVER_NAME = "nocetta";
const SERVER_VERSION = "0.0.1";

/**
 * The stdio MCP server over one facade: the loop (capture → recall → drift →
 * repair) is entirely the facade's; this module only shapes the door — six
 * tools, which is the cap. The SDK converts a handler throw into an
 * { isError: true, text: message } result, so the facade's honest refusals
 * (ambiguous symbol, never-leak, unknown id) reach the agent verbatim, never
 * as stack traces (light 5).
 */
export function createNocettaServer(repoRoot: string): McpServer {
  const nc = open(repoRoot);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, (args) => ({
      content: [{ type: "text", text: tool.run(nc, args) }],
    }));
  }
  return server;
}

/** The repo root is the deployment decision, so it stays ambient: NOCETTA_ROOT
 * when the host launches the server outside the repo, else cwd (the usual case
 * — an MCP client starts the server inside the project it's remembering for). */
export async function main(): Promise<void> {
  const repoRoot = process.env.NOCETTA_ROOT ?? process.cwd();
  const server = createNocettaServer(repoRoot);
  await server.connect(new StdioServerTransport());
}

// Entrypoint-and-module guard: argv[1] routed through pathToFileURL so
// URL-encoding (spaces, non-ASCII) and Windows drive letters compare equal
// to import.meta.url — the plain string comparison silently fails on those.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err: unknown) => {
    // stderr only — stdout is the MCP protocol channel.
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  });
}
