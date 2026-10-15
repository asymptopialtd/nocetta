import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { open } from "../../src/facade/index.js";
import { createNocettaServer } from "../../src/mcp/index.js";

/**
 * The bug this fixes, end to end: the MCP server is launched ONCE at a bare
 * parent directory that holds several independent project repos (as a dev often
 * opens a games folder), and must still route each belief to the right
 * project's committed `.nocetta/` store — anchored writes by their artifactPath,
 * unanchored writes by the client's advertised workspace roots — never plant a
 * single shared store at the parent.
 */

// parent/
//   game-a/.git  src/foo.ts   (two sibling projects under a bare parent)
//   game-b/.git  src/bar.ts
let parent: string;
let gameA: string;
let gameB: string;
let client: Client;
let closeServer: () => Promise<void>;

const FOO = "export function foo(): number {\n  return 1;\n}\n";

/** Advertised roots for the test client's ListRoots handler — mutable so each
 * test sets what the "workspace" exposes before the unanchored call. */
let advertisedRoots: string[];

async function startServer(): Promise<void> {
  const server = createNocettaServer({ base: parent });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "nocetta-test", version: "0.0.1" }, { capabilities: { roots: {} } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: advertisedRoots.map((r) => ({ uri: pathToFileURL(r).href })),
  }));
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeServer = async () => {
    await client.close();
    await server.close();
  };
}

beforeEach(async () => {
  parent = mkdtempSync(join(tmpdir(), "nocetta-parent-"));
  gameA = join(parent, "game-a");
  gameB = join(parent, "game-b");
  for (const [dir, file, body] of [
    [gameA, "src/foo.ts", FOO],
    [gameB, "src/bar.ts", FOO.replace("foo", "bar")],
  ] as const) {
    mkdirSync(join(dir, ".git"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, file), body, "utf8");
  }
  advertisedRoots = [];
  await startServer();
});

afterEach(async () => {
  await closeServer();
  rmSync(parent, { recursive: true, force: true });
});

interface ToolResult {
  isError: boolean;
  text: string;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (result.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
  return { isError: result.isError === true, text };
}

describe("parent-launched MCP server routes per write (Seam 5)", () => {
  it("an anchored write lands in the artifact's project store, with the path rebased to that store", async () => {
    const res = await callTool("memory_remember", {
      body: "foo returns the number one",
      kind: "claim",
      artifact_path: "game-a/src/foo.ts", // relative to the launch parent
      symbol_name: "foo",
    });
    expect(res.isError).toBe(false);
    const shaped = JSON.parse(res.text) as { id: string; anchor: string[] };
    // the anchor locator is store-relative (src/foo.ts), never parent-relative
    expect(shaped.anchor).toEqual(["src/foo.ts › function foo"]);

    // the belief is in game-a's store, and NOT in a shared parent store
    expect(existsSync(join(parent, ".nocetta"))).toBe(false);
    const inGameA = open(gameA).nodes();
    expect(inGameA.map((n) => n.id)).toContain(shaped.id);
    expect(inGameA[0]!.anchors[0]!.artifactPath).toBe("src/foo.ts");
    expect(open(gameB).nodes()).toHaveLength(0);
  });

  it("sibling anchored writes fan out to their own stores — memory never fragments to the parent", async () => {
    await callTool("memory_remember", { body: "foo returns one", kind: "claim", artifact_path: "game-a/src/foo.ts", symbol_name: "foo" });
    await callTool("memory_remember", { body: "bar returns one", kind: "claim", artifact_path: "game-b/src/bar.ts", symbol_name: "bar" });

    expect(open(gameA).nodes()).toHaveLength(1);
    expect(open(gameB).nodes()).toHaveLength(1);
    expect(existsSync(join(parent, ".nocetta"))).toBe(false);
  });

  it("a files_in_play search is routed to that file's project and finds its belief", async () => {
    await callTool("memory_remember", { body: "foo returns one", kind: "claim", artifact_path: "game-a/src/foo.ts", symbol_name: "foo" });
    const found = await callTool("memory_search", { files_in_play: ["game-a/src/foo.ts"] });
    const ids = found.text.split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { id: string }).id);
    expect(ids).toHaveLength(1);
  });

  it("an unanchored write with the sole advertised root lands in that project", async () => {
    advertisedRoots = [gameA];
    const res = await callTool("memory_remember", { body: "we commit the store to git", kind: "value" });
    expect(res.isError).toBe(false);
    const { id } = JSON.parse(res.text) as { id: string };
    expect(open(gameA).nodes().map((n) => n.id)).toContain(id);
    expect(existsSync(join(parent, ".nocetta"))).toBe(false);
  });

  it("an unanchored write refuses when the only advertised root is the bare parent", async () => {
    advertisedRoots = [parent];
    const res = await callTool("memory_remember", { body: "some unanchored decision", kind: "value" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/project repos|NOCETTA_ROOT/);
    expect(existsSync(join(parent, ".nocetta"))).toBe(false);
  });

  it("an unanchored write refuses as ambiguous when several project roots are advertised", async () => {
    advertisedRoots = [gameA, gameB];
    const res = await callTool("memory_remember", { body: "another unanchored decision", kind: "value" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/ambiguous|NOCETTA_ROOT/);
  });
});
