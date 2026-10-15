#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { INSTRUCTIONS } from "./instructions.js";
import { ONBOARD_PROMPT } from "./onboard.js";
import { clientRootsFrom, StoreRouter } from "./router.js";
import { TOOLS } from "./tools.js";
const SERVER_NAME = "nocetta";
// src/mcp and dist/mcp both sit two levels below the package root (repo
// checkout, installed package, tarball) — read the version it ships in,
// never a second copy of it here.
const { version: SERVER_VERSION } = createRequire(import.meta.url)("../../package.json");
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
export function createNocettaServer(config) {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
    const router = typeof config === "string"
        ? new StoreRouter({ override: config })
        : new StoreRouter({ ...config, listRoots: clientRootsFrom(server.server) });
    for (const tool of TOOLS) {
        server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => {
            const { nc, args: routedArgs } = await routeCall(router, tool, args);
            return { content: [{ type: "text", text: tool.run(nc, routedArgs) }] };
        });
    }
    server.registerPrompt("onboard", {
        title: "Seed nocetta for an existing project",
        description: "One-time guided distillation for a project already underway: capture the load-bearing beliefs the store should have started with, each anchored to its receipt. Run once, when the store is empty.",
    }, () => ({ messages: [{ role: "user", content: { type: "text", text: ONBOARD_PROMPT } }] }));
    return server;
}
/**
 * Pick the facade this call writes/reads against, and normalize the paths in
 * its args to that store's root. Routing is per tool: an anchored write or a
 * files_in_play search is self-locating (the path names the project); every
 * other call uses the client-roots default. Tools stay pure functions of
 * (facade, args) — this is the one place that knows a call can span projects.
 */
async function routeCall(router, tool, rawArgs) {
    const args = (rawArgs ?? {});
    if (tool.name === "memory_remember" && typeof args.artifact_path === "string" && args.artifact_path.length > 0) {
        const { nc, artifactPath } = router.forArtifact(args.artifact_path);
        return { nc, args: { ...args, artifact_path: artifactPath } };
    }
    if (tool.name === "memory_search" && Array.isArray(args.files_in_play) && args.files_in_play.length > 0) {
        const { nc, files } = router.forFiles(args.files_in_play);
        return { nc, args: { ...args, files_in_play: files } };
    }
    const { nc } = await router.forDefault();
    return { nc, args };
}
/** The store is discovered per write, not declared (router.ts): NOCETTA_ROOT
 * forces one root when set, otherwise each call routes from its own artifact
 * path or the MCP client's advertised workspace roots, with the launch cwd as
 * the base for relative paths and the discovery fallback. */
export async function main() {
    const override = process.env.NOCETTA_ROOT;
    const server = createNocettaServer({
        base: process.cwd(),
        ...(override !== undefined ? { override: resolve(override) } : {}),
    });
    await server.connect(new StdioServerTransport());
}
// Entrypoint-and-module guard: argv[1] realpath'd through pathToFileURL so
// URL-encoding (spaces, non-ASCII), Windows drive letters, and package-manager
// bin symlinks (pnpm installs node_modules/<pkg> as a symlink; argv[1] keeps
// the link path while import.meta.url resolves the target) all compare equal
// to import.meta.url. A silently-false guard means `npx nocetta` exits 0
// printing nothing — worse than a crash.
function isEntrypoint() {
    try {
        return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
    }
    catch {
        return false;
    }
}
if (isEntrypoint()) {
    main().catch((err) => {
        // stderr only — stdout is the MCP protocol channel.
        console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
        process.exitCode = 1;
    });
}
