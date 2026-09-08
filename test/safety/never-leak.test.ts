import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NeverLeakError, writeNode } from "../../src/store/store.js";
import type { MemoryNode } from "../../src/store/types.js";

function node(overrides: Partial<MemoryNode> & { id: string }): MemoryNode {
  return {
    kind: "claim",
    scope: "global",
    anchors: [],
    edges: [],
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    txnTime: "2026-01-01T00:00:00.000Z",
    authority: "default",
    overrideReason: null,
    body: "body",
    ...overrides,
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nocetta-never-leak-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("never-leak write gate", () => {
  it("allows an ordinary claim to be written", () => {
    expect(() => writeNode(dir, node({ id: "ok", body: "calculateTotal sums the items array." }))).not.toThrow();
    expect(existsSync(join(dir, "ok.md"))).toBe(true);
  });

  it("refuses a private key block and does not write the file", () => {
    const secret = node({
      id: "leak-key",
      body: "here's our deploy key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
    });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
    expect(existsSync(join(dir, "leak-key.md"))).toBe(false);
  });

  it("refuses .env-style KEY=value assignments", () => {
    const secret = node({ id: "leak-env", body: "the fix was:\nDATABASE_PASSWORD=hunter2superlong\n" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  it("refuses an AWS access key id", () => {
    const secret = node({ id: "leak-aws", body: "rotate AKIAABCDEFGHIJKLMNOP immediately" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  it("refuses a credentialed URL (git-credentials shape)", () => {
    const secret = node({ id: "leak-url", body: "remote is https://svc-bot:abc123def456@github.com/org/repo.git" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  it("refuses a netrc-style credential line", () => {
    const secret = node({ id: "leak-netrc", body: "machine api.example.com login svc password sup3rSecretValue" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  it("refuses a high-entropy token shape even without a known-vendor prefix", () => {
    const secret = node({ id: "leak-entropy", body: "found in the logs: Q7mK2pL9vT4xR8wZ1nB6cF3dH5jY0sU2eG" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  it("refuses anchoring to a known credential file by basename, regardless of body content", () => {
    const secret = node({
      id: "leak-anchor",
      body: "totally normal claim",
      anchors: [{ locator: ".env › const X", hash: "h", artifactPath: "config/.env" }],
    });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });

  // Regression: dogfooding (importing real project notes) showed the entropy
  // heuristic firing on ordinary technical prose. These must now be allowed.
  it("allows slash-joined term lists and paths", () => {
    expect(() =>
      writeNode(dir, node({ id: "fp-terms", body: "the pipeline is envelope/egress/draft/flush/arbiter and the verbs are url/method/host/path/command/to/subject" })),
    ).not.toThrow();
    expect(() =>
      writeNode(dir, node({ id: "fp-path", body: "the renderer lives in packages/governance/result-view/src/present" })),
    ).not.toThrow();
  });

  it("allows a bare UUID mentioned in prose", () => {
    expect(() =>
      writeNode(dir, node({ id: "fp-uuid", body: "session 40be0fa5-c38b-4445-8f27-7757670e40a3 handled the flush" })),
    ).not.toThrow();
  });

  it("still catches a base64 secret that happens to contain a slash", () => {
    const secret = node({ id: "leak-b64", body: "leaked token: aB3dE/fGh9Ij0kLm1nOp2qRs3tUv4wXy5zA6bC7dE8f=" });
    expect(() => writeNode(dir, secret)).toThrow(NeverLeakError);
  });
});
