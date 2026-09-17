#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { open } from "../facade/open.js";
import { resolveRoot } from "../facade/root.js";
import { INSTRUCTIONS } from "./instructions.js";
import { ONBOARD_PROMPT } from "./onboard.js";
import { TOOLS } from "./tools.js";

const SERVER_NAME = "nocetta";
// src/mcp and dist/mcp both sit two levels below the package root (repo
// checkout, installed package, tarball) — read the version it ships in,
// never a second copy of it here.
const { version: SERVER_VERSION } = createRequire(import.meta.url)("../../package.json") as {
  version: string;
};

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
export function createNocettaServer(repoRoot: string): McpServer {
  const nc = open(repoRoot);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, (args) => ({
      content: [{ type: "text", text: tool.run(nc, args) }],
    }));
  }
  server.registerPrompt(
    "onboard",
    {
      title: "Seed nocetta for an existing project",
      description:
        "One-time guided distillation for a project already underway: capture the load-bearing beliefs the store should have started with, each anchored to its receipt. Run once, when the store is empty.",
    },
    () => ({ messages: [{ role: "user", content: { type: "text", text: ONBOARD_PROMPT } }] }),
  );
  return server;
}

/** The repo root is discovered, not declared (facade/root.ts): NOCETTA_ROOT
 * when the host launches the server outside the repo, else cwd (the usual case
 * — an MCP client starts the server inside the project it's remembering for). */
export async function main(): Promise<void> {
  const repoRoot = process.env.NOCETTA_ROOT ?? resolveRoot();
  const server = createNocettaServer(repoRoot);
  await server.connect(new StdioServerTransport());
}

// Entrypoint-and-module guard: argv[1] realpath'd through pathToFileURL so
// URL-encoding (spaces, non-ASCII), Windows drive letters, and package-manager
// bin symlinks (pnpm installs node_modules/<pkg> as a symlink; argv[1] keeps
// the link path while import.meta.url resolves the target) all compare equal
// to import.meta.url. A silently-false guard means `npx nocetta` exits 0
// printing nothing — worse than a crash.
function isEntrypoint(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch((err: unknown) => {
    // stderr only — stdout is the MCP protocol channel.
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  });
}
