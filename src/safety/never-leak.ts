import type { MemoryNode } from "../store/types.js";

const CREDENTIAL_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  ".netrc",
  ".pgpass",
  ".git-credentials",
]);

function basenameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

interface SecretPattern {
  name: string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: ".env-style assignment", pattern: /^[A-Z_][A-Z0-9_]{2,}\s*=\s*['"]?\S{8,}['"]?\s*$/m },
  { name: "AWS access key id", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "api key / token / secret assignment", pattern: /\b(?:api[_-]?key|secret|token|password|bearer)\b\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{12,}['"]?/i },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "netrc-style credentials", pattern: /\bmachine\s+\S+\s+login\s+\S+\s+password\s+\S+/i },
  { name: "pgpass line", pattern: /^[^:\s#]+:\d+:[^:\s]+:[^:\s]+:[^:\s]+$/m },
  { name: "credentialed URL", pattern: /\bhttps?:\/\/[^:/\s]+:[^@/\s]+@/ },
];

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** A long run of dense-looking token characters with high Shannon entropy —
 * the shape of an API key/secret, not a match on any known vendor format. */
function findHighEntropyToken(text: string): string | undefined {
  const candidates = text.match(/[A-Za-z0-9+/_=-]{24,}/g) ?? [];
  return candidates.find((c) => shannonEntropy(c) >= 4.0);
}

/** Scan a memory node for obvious secrets before it's ever written. Returns
 * human-readable violation reasons; empty means clean. */
export function scanForSecrets(node: MemoryNode): string[] {
  const violations: string[] = [];

  for (const anchor of node.anchors) {
    const basename = basenameOf(anchor.artifactPath);
    if (CREDENTIAL_BASENAMES.has(basename)) {
      violations.push(`anchor references a credential file: ${anchor.artifactPath}`);
    }
  }

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(node.body)) violations.push(`body matches ${name}`);
  }

  const token = findHighEntropyToken(node.body);
  if (token) violations.push(`body contains a high-entropy token shape (${token.length} chars)`);

  return violations;
}
