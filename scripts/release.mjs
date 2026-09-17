#!/usr/bin/env node
/**
 * Zero-dependency release tool for nocetta.
 *
 *   node scripts/release.mjs --check        # verify: typecheck, tests, fresh dist, fresh lockfile
 *   node scripts/release.mjs <version>      # release: version | patch | minor | major
 *
 * A release syncs the version into all three manifests (package.json,
 * .claude-plugin/plugin.json, .claude-plugin/marketplace.json), typechecks,
 * runs the full test suite, rebuilds dist/, regenerates package-lock.json
 * (in a clean directory — npm trips over pnpm's node_modules layout),
 * commits, re-verifies the committed tree exactly the way a Claude Code
 * marketplace install does (clone + npm ci --ignore-scripts + smoke tests),
 * and only then tags. Nothing is pushed or published.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODE_CHECK = "--check";

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const step = (message) => console.log(`\n▸ ${message}`);
const run = (command, options = {}) => {
  const result = spawnSync(command, { shell: true, stdio: "inherit", ...options });
  if (result.status !== 0) fail(`command failed: ${command}`);
};
const tryRun = (command) => spawnSync(command, { shell: true, encoding: "utf8" });
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

const bumpVersion = (version, kind) => {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) fail(`cannot parse current version: ${version}`);
  if (kind === "major") return `${parts[0] + 1}.0.0`;
  if (kind === "minor") return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
};

/** Regenerate package-lock.json the way a marketplace install resolves it:
 * from package.json alone in a clean directory, never from the dev
 * node_modules (pnpm's layout carries state npm rejects). Returns true when
 * the regenerated lockfile differs from the committed one. */
const regeneratePackageLock = () => {
  const dir = mkdtempSync(join(tmpdir(), "nocetta-lock-"));
  try {
    cpSync("package.json", join(dir, "package.json"));
    if (existsSync(".npmrc")) cpSync(".npmrc", join(dir, ".npmrc"));
    run("npm install --package-lock-only --ignore-scripts", { cwd: dir });
    const fresh = readFileSync(join(dir, "package-lock.json"));
    const stale = fresh.equals(readFileSync("package-lock.json")) === false;
    if (stale) writeFileSync("package-lock.json", fresh);
    return stale;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Clone HEAD into a temp dir and verify it the way a Claude Code
 * marketplace install does: frozen no-scripts dependency install, then run
 * the hook, the store, and the gate from the committed dist. */
const simulateMarketplaceInstall = () => {
  const dir = mkdtempSync(join(tmpdir(), "nocetta-market-"));
  try {
    run(`git clone --quiet . "${dir}"`);
    run("npm ci --ignore-scripts", { cwd: dir });
    run("node dist/cli/cli.js ls", { cwd: dir });
    run(`sh -c "echo '{}' | node dist/cli/cli.js hook stop"`, { cwd: dir });
    run("node dist/cli/cli.js check --strict", { cwd: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const mode = process.argv[2];
if (mode !== MODE_CHECK && !mode) fail(`usage: node scripts/release.mjs --check | <version | patch | minor | major>`);

const isRelease = mode !== MODE_CHECK;
if (isRelease) {
  step("git tree must be clean (the release commit gathers everything)");
  if (tryRun("git status --porcelain").stdout.trim() !== "") {
    fail("working tree is dirty — commit or stash first");
  }
}

step("typecheck");
run("pnpm typecheck");

step("tests");
run("pnpm test");

step("build");
run("pnpm build");

step("regenerate package-lock.json (clean-directory resolution)");
const lockfileChanged = regeneratePackageLock();
if (lockfileChanged) console.log("package-lock.json was stale — regenerated.");

if (!isRelease) {
  step("dist freshness");
  const staleDist = tryRun("git diff --exit-code dist");
  if (staleDist.status !== 0) fail("committed dist/ is stale — rebuild happened just now; commit it (git add dist)");
  console.log("\n✓ everything checks out");
  process.exit(0);
}

const current = readJson("package.json").version;
const version = ["patch", "minor", "major"].includes(mode) ? bumpVersion(current, mode) : mode;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`bad version: ${version}`);
if (version === current) fail(`already at ${version}`);

step(`sync version ${current} → ${version} into the three manifests`);
writeJson("package.json", { ...readJson("package.json"), version });
const pluginJsonPath = ".claude-plugin/plugin.json";
writeJson(pluginJsonPath, { ...readJson(pluginJsonPath), version });
const marketplacePath = ".claude-plugin/marketplace.json";
const marketplace = readJson(marketplacePath);
marketplace.plugins[0].version = version;
writeJson(marketplacePath, marketplace);

step("regenerate package-lock.json against the released package.json");
regeneratePackageLock();

step("commit");
run("git add -A");
run(`git commit -m "chore(release): v${version}"`);

step("marketplace install simulation (fresh clone + npm ci + smoke tests)");
simulateMarketplaceInstall();

step(`tag v${version}`);
run(`git tag v${version}`);

console.log(`
✓ released v${version} (commit + tag, not pushed)

next, by hand:
  git push && git push --tags     # publishes the marketplace two-liner
  npm publish                     # ships the package (deliberately not automatic)`);
