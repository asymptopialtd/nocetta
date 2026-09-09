import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { open } from "../../src/facade/index.js";
import { createNocettaServer } from "../../src/mcp/index.js";

/**
 * Seam 5: the MCP server, driven in-process through the SDK's linked
 * in-memory transports — a real server object, a real fixture repo, the real
 * store on disk, no mocks. The property under test: the whole loop (capture →
 * recall → drift → repair → history) runs through six tools whose errors are
 * content and whose results are shaped for a context window.
 */

const FOO_PATH = "src/foo.ts";

const FOO_V0 = `export function foo(): number {
  return 1;
}
`;

// A real body edit to foo on disk — the store stays untouched, which is what
// makes the node dirty.
const FOO_EDITED = FOO_V0.replace("return 1;", "return 42;");

const TOOL_NAMES = ["memory_search", "memory_remember", "memory_supersede", "memory_worklist", "memory_repair", "memory_as_of"];

let repoRoot: string;
let client: Client;
let closeServer: () => Promise<void>;

beforeEach(async () => {
  repoRoot = mkdtempSync(join(tmpdir(), "nocetta-mcp-"));
  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, FOO_PATH), FOO_V0, "utf8");

  const server = createNocettaServer(repoRoot);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "nocetta-test", version: "0.0.1" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeServer = async () => {
    await client.close();
    await server.close();
  };
});

afterEach(async () => {
  await closeServer();
  rmSync(repoRoot, { recursive: true, force: true });
});

interface ToolResult {
  isError: boolean;
  text: string;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (result.content ?? [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
  return { isError: result.isError === true, text };
}

/** Parse a shaped result of one-JSON-object-per-line. */
function lines(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("nocetta MCP server (Seam 5)", () => {
  it("tools/list returns exactly the six tools, each with a non-empty description", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("the initialize response carries the workflow contract: the loop verbs, the store path, the guardrail", async () => {
    // instructions are a delivery-guaranteed channel — they arrive at
    // handshake, not by the model choosing to load anything
    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    for (const verb of ["memory_search", "memory_remember", "memory_worklist", "memory_supersede"]) {
      expect(instructions).toContain(verb);
    }
    expect(instructions).toContain(".nocetta/");
    // case-insensitive: the guardrail opens a sentence ("Skip transient ...")
    expect(instructions?.toLowerCase()).toContain("skip transient");
  });

  it("instructions carry the when-and-why, never a tool description's schema wording verbatim", async () => {
    // the layering rule: mechanics live in tools/list; restating them in an
    // always-on payload pays per session for what the descriptions already say
    expect(client.getInstructions()).not.toContain("files_in_play are repo-relative paths");
  });

  it("memory_remember resolves the anchor; the shaped result carries id and anchor; a files_in_play search finds it", async () => {
    const remembered = await callTool("memory_remember", {
      body: "foo returns the number one",
      kind: "claim",
      artifact_path: FOO_PATH,
      symbol_name: "foo",
    });
    expect(remembered.isError).toBe(false);
    const shaped = JSON.parse(remembered.text) as { id: string; anchor: string[]; warnings: string[]; file: string; notes: string[] };
    expect(shaped.anchor).toEqual([`${FOO_PATH} › function foo`]);
    expect(shaped.warnings).toEqual([]);
    // post-write staging hint (decision 5d24cc83): the written file's
    // repo-relative path plus a nudge to stage it — never an auto git add.
    expect(shaped.file).toMatch(/^\.nocetta\/memory\/.*\.md$/);
    expect(shaped.notes[0]).toContain(shaped.file);
    expect(shaped.notes[0]).toContain("uncommitted");

    const found = await callTool("memory_search", { files_in_play: [FOO_PATH] });
    expect(lines(found.text).map((hit) => hit.id)).toEqual([shaped.id]);
  });

  it("memory_remember accepts an explicit summary and surfaces it on recall", async () => {
    await callTool("memory_remember", {
      body: "foo returns the number one",
      summary: "foo returns 1",
      kind: "claim",
      artifact_path: FOO_PATH,
      symbol_name: "foo",
    });
    const found = lines((await callTool("memory_search", { files_in_play: [FOO_PATH] })).text);
    expect(found[0]!.summary).toBe("foo returns 1");
  });

  it("memory_remember accepts a commit and surfaces it on recall", async () => {
    await callTool("memory_remember", { body: "foo was fixed to return 1", kind: "claim", commit: "deadbeef" });
    const found = lines((await callTool("memory_search", { keyword: "foo was fixed" })).text);
    expect(found[0]!.commit).toBe("deadbeef");
  });

  it("memory_remember's notes add the verbose-body nudge only once the body is well past the threshold", async () => {
    const short = await callTool("memory_remember", { body: "a short claim", kind: "claim" });
    const shortNotes = (JSON.parse(short.text) as { notes: string[] }).notes;
    expect(shortNotes.some((n) => n.includes("Why:"))).toBe(false);

    const verbose = await callTool("memory_remember", { body: "x".repeat(1300), kind: "claim" });
    const verboseNotes = (JSON.parse(verbose.text) as { notes: string[] }).notes;
    expect(verboseNotes.some((n) => n.includes("**Why:**"))).toBe(true);
  });

  it("a secret body comes back as an isError result carrying the never-leak refusal, and nothing is written", async () => {
    const refused = await callTool("memory_remember", { body: "the password: hunter2hunter2", kind: "claim" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("refusing to write node");

    const found = await callTool("memory_search", { keyword: "password" });
    // an empty result teaches capture: memory was asked and didn't know
    expect(found.text).toContain("no matching memories");
    expect(found.text).toContain("memory_remember");
  });

  it("memory_search shapes each line with id/kind/authority/anchor/body — and never a hash", async () => {
    await callTool("memory_remember", { body: "foo returns the number one", kind: "claim", artifact_path: FOO_PATH, symbol_name: "foo" });

    const found = await callTool("memory_search", { files_in_play: [FOO_PATH], keyword: "returns" });
    const shaped = lines(found.text);
    expect(shaped).toHaveLength(1);
    for (const field of ["id", "kind", "authority", "anchor", "body"]) {
      expect(shaped[0]).toHaveProperty(field);
    }
    expect(shaped[0]!.anchor).toEqual([`${FOO_PATH} › function foo`]);
    expect(found.text).not.toContain("hash");
    // currency is the engine's decision, not the agent's to re-litigate —
    // current results carry no validity window (the as-of view does)
    expect(found.text).not.toContain("validFrom");
    expect(found.text).not.toContain("validTo");
  });

  it("memory_search with neither files_in_play nor keyword refuses instead of returning an empty page", async () => {
    const refused = await callTool("memory_search", {});
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("files_in_play");
  });

  it("memory_worklist lists the drifted node with its reason verbatim, its artifactPath, and the repair pointer", async () => {
    await callTool("memory_remember", { body: "foo returns the number one", kind: "claim", artifact_path: FOO_PATH, symbol_name: "foo" });
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const worklist = await callTool("memory_worklist");
    const shaped = JSON.parse(worklist.text) as {
      dirty: { id: string; reason: string; artifactPath: string }[];
      conflicts: unknown[];
      issues: unknown[];
      repair: string;
    };
    expect(shaped.dirty).toHaveLength(1);
    expect(shaped.dirty[0]!.reason).toMatch(/hash changed/);
    expect(shaped.dirty[0]!.artifactPath).toBe(FOO_PATH);
    expect(shaped.conflicts).toEqual([]);
    expect(shaped.issues).toEqual([]);
    expect(shaped.repair).toContain("memory_repair");
  });

  it("memory_repair reanchor clears the worklist without changing the belief", async () => {
    const remembered = await callTool("memory_remember", { body: "foo returns the number one", kind: "claim", artifact_path: FOO_PATH, symbol_name: "foo" });
    const { id } = JSON.parse(remembered.text) as { id: string };
    writeFileSync(join(repoRoot, FOO_PATH), FOO_EDITED, "utf8");

    const repaired = await callTool("memory_repair", { node_id: id, action: "reanchor", symbol_name: "foo" });
    expect(repaired.isError).toBe(false);
    expect(JSON.parse(repaired.text)).toMatchObject({ id, anchor: [`${FOO_PATH} › function foo`] });

    const worklist = await callTool("memory_worklist");
    expect(JSON.parse(worklist.text).dirty).toEqual([]);
  });

  it("memory_repair retire removes the node from current recall", async () => {
    const remembered = await callTool("memory_remember", { body: "foo returns the number one", kind: "claim", artifact_path: FOO_PATH, symbol_name: "foo" });
    const { id } = JSON.parse(remembered.text) as { id: string };

    const retired = await callTool("memory_repair", { node_id: id, action: "retire", reason: "foo is gone; the claim has no subject" });
    expect(retired.isError).toBe(false);
    expect(JSON.parse(retired.text)).toMatchObject({ id, retiredReason: "foo is gone; the claim has no subject" });

    const found = await callTool("memory_search", { files_in_play: [FOO_PATH] });
    expect(found.text).toContain("no matching memories");
    expect(found.text).toContain("memory_remember");
  });

  it("memory_supersede: search resolves to the new belief, and memory_as_of at the old txnTime still returns the old", async () => {
    const v1 = await callTool("memory_remember", { body: "foo returns one", kind: "claim", artifact_path: FOO_PATH, symbol_name: "foo" });
    const v1Id = (JSON.parse(v1.text) as { id: string }).id;
    // capture stamps validFrom = txnTime; the store (not a search result) is
    // where the test reads it — current results carry no validity window
    const v1TxnTime = open(repoRoot).nodes().find((n) => n.id === v1Id)!.txnTime;

    // txnTime is stamped at millisecond resolution; make the supersession
    // strictly later so the as-of bracket below is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const superseded = await callTool("memory_supersede", { old_id: v1Id, body: "foo now returns 42" });
    expect(superseded.isError).toBe(false);
    const tipId = (JSON.parse(superseded.text) as { tip: string }).tip;
    expect(tipId).not.toBe(v1Id);

    // the old fact is never served as current: the tip replaces it
    expect(lines((await callTool("memory_search", { files_in_play: [FOO_PATH] })).text).map((hit) => hit.id)).toEqual([tipId]);
    // the old belief is still what the store held at the earlier txnTime
    const asOfLines = lines((await callTool("memory_as_of", { at: v1TxnTime })).text);
    expect(asOfLines.map((hit) => hit.id)).toEqual([v1Id]);
    // there the window IS the answer: as-of beliefs carry validity, closure included
    expect(asOfLines[0]!.validFrom).toBe(v1TxnTime);
    expect(asOfLines[0]!.validTo).toBe(open(repoRoot).nodes().find((n) => n.id === v1Id)!.validTo);
  });

  it("honest refusals surface as isError text: memory_remember with an unknown symbol name", async () => {
    const refused = await callTool("memory_remember", { body: "a claim about a symbol that isn't there", kind: "claim", artifact_path: FOO_PATH, symbol_name: "nope" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`no symbol named "nope"`);
  });
});
