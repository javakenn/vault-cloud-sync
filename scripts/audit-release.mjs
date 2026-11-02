import { spawnSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
const ignore = new Set([".git", "node_modules", ".data", ".wrangler", "dist"]);
const forbidden = [
  /\/Users\//,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /postgres(?:ql)?:\/\/[^\s]+/,
];
const files = [];
async function scan(dir = ".") {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (
      ignore.has(e.name) ||
      e.name === "wrangler.local.jsonc" ||
      e.name.startsWith(".dev.vars") ||
      e.name.startsWith(".env")
    )
      continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await scan(p);
    else files.push(p);
  }
}
await scan();
for (const file of files) {
  if (
    file.endsWith(".zip") ||
    file.endsWith("package-lock.json") ||
    file === "scripts/audit-release.mjs"
  )
    continue;
  const text = await readFile(file, "utf8");
  for (const pattern of forbidden)
    assert.ok(!pattern.test(text), "Private content pattern found: " + file);
}
const m = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(m.version, pkg.version);
assert.ok(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.version));
assert.equal(
  JSON.parse(await readFile("versions.json", "utf8"))[m.version],
  m.minAppVersion,
);
assert.ok(m.description.endsWith("."));
assert.ok(m.description.length <= 250);
for (const f of [
  "main.js",
  "manifest.json",
  "styles.css",
  "LICENSE",
  "README.md",
  "PRIVACY.md",
])
  assert.ok((await stat(f)).size > 0, f);
const cfg = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
assert.ok(!cfg.account_id);
assert.equal(
  cfg.d1_databases[0].database_id,
  "00000000-0000-0000-0000-000000000000",
);
console.log(
  "Release audit passed: sanitized source, generic bindings, version consistency, public assets.",
);

const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status === 0) {
  const names = tracked.stdout.split("\0").filter(Boolean);
  for (const name of names) assert.ok(!/^(?:\.data\/|\.dev\.vars|\.env|wrangler\.local\.jsonc)/.test(name), "Private file tracked: " + name);
  for (const name of ["plugin/styles.css", "plugin/src/main.ts", "cloudflare/worker.ts", "scripts/build.mjs"]) assert.ok(names.includes(name), "Required source missing from Git: " + name);
}
