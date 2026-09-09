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

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Whether a candidate is a separator-joined run of low-entropy words — a path,
 * a slash-joined term list, a snake/kebab identifier, or a `+`/`.`-joined
 * identifier chain (e.g. "SessionStore+SystemPrompt+ToolRuntime") — rather
 * than a dense secret blob. Its length comes from the separators between
 * short word-like pieces, not from randomness. A real base64/base64url
 * secret split on those separators yields long, high-entropy pieces, so it
 * is NOT excluded.
 */
function isSeparatorJoinedWords(s: string): boolean {
  const segments = s.split(/[/_+.-]/).filter((seg) => seg.length > 0);
  if (segments.length < 2) return false;
  // Each piece is a short, low-entropy chunk — a word, a number, or a hex
  // quartet (paths carry numeric/hex segments too). A real secret's pieces stay
  // long or high-entropy, so it is not misclassified.
  return segments.every((seg) => seg.length <= 20 && shannonEntropy(seg) < 3.5);
}

/**
 * A long run of dense-looking token characters with high Shannon entropy — the
 * shape of an API key/secret, not a match on any known vendor format.
 *
 * Excludes false-positive shapes that dogfooding surfaced in ordinary technical
 * prose (importing project notes as memory): UUIDs, and separator-joined paths /
 * term lists like "packages/governance/result-view/src" or
 * "envelope/egress/draft/flush/arbiter". A genuine secret is a single dense run,
 * so those exclusions don't weaken real detection — a base64 blob containing "/"
 * still trips the check because its pieces stay high-entropy.
 */
function findHighEntropyToken(text: string): string | undefined {
  const candidates = text.match(/[A-Za-z0-9+/_=-]{24,}/g) ?? [];
  for (const candidate of candidates) {
    if (UUID_RE.test(candidate)) continue;
    if (isSeparatorJoinedWords(candidate)) continue;
    if (shannonEntropy(candidate) >= 4.0) return candidate;
  }
  return undefined;
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
  if (token) {
    // A redacted preview (first 6 + last 2 chars — every candidate is at
    // least 24 chars long, so this never exposes more than a fraction of
    // it) lets a writer locate the offending run without the full token
    // ever being echoed back.
    const preview = `${token.slice(0, 6)}…${token.slice(-2)}`;
    violations.push(`body contains a high-entropy token shape (${token.length} chars: ${preview})`);
  }

  return violations;
}
