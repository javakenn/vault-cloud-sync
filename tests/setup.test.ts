import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// CLI helpers are plain JavaScript and have no Cloudflare credentials in tests.
// @ts-expect-error JS setup module is exercised at runtime.
import { provision, prepareDevice } from "../scripts/setup-lib.mjs";
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), "vault-setup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of [
    "wrangler.jsonc",
    "manifest.json",
    "main.js",
    "styles.css",
  ])
    await cp(file, join(root, file));
  const commands: string[][] = [];
  let exists = false;
  const accountId = "a".repeat(32),
    name = "vault-setup-test";
  const run = (_: string, args: string[]) => {
    commands.push(args);
    if (args[0] === "d1" && args[1] === "list")
      return JSON.stringify(
        exists ? [{ name, uuid: "11111111-1111-4111-8111-111111111111" }] : [],
      );
    if (args[0] === "d1" && args[1] === "create") exists = true;
    if (args[0] === "deploy")
      return "Deployed https://vault-setup-test.example.workers.dev";
    return "";
  };
  let issued = 0;
  const request = async (url: string) => {
    if (url.endsWith("/api/health"))
      return Response.json({ provider: "cloudflare", readOnly: false });
    if (url.endsWith("/api/admin/devices")) {
      issued++;
      return Response.json({
        id: "test-device",
        token: "test-device-token-".repeat(3),
        vault: "notes",
      });
    }
    if (url.endsWith("/api/identity"))
      return Response.json({ id: "test-device", vault: "notes", name: "Test" });
    throw Error("Unexpected endpoint");
  };
  return {
    root,
    accountId,
    name,
    run,
    request,
    commands,
    markExisting: () => {
      exists = true;
    },
    issued: () => issued,
  };
}
test("self-host setup resumes without duplicate resources or secret rotation and packages per-device configs privately", async (t) => {
  const f = await fixture(t);
  const options = { ...f, log: () => {} };
  const state = await provision(options);
  const before = await readFile(
    join(f.root, ".data/admin-secret.json"),
    "utf8",
  );
  await provision(options);
  assert.equal(
    f.commands.filter((c) => c[0] === "d1" && c[1] === "create").length,
    1,
  );
  assert.equal(
    f.commands.filter((c) => c[0] === "r2" && c[2] === "create").length,
    1,
  );
  assert.equal(
    await readFile(join(f.root, ".data/admin-secret.json"), "utf8"),
    before,
  );
  const a = await prepareDevice({
    root: f.root,
    state,
    vault: "notes",
    platform: "mac",
    name: "Mac",
    request: f.request,
  });
  await prepareDevice({
    root: f.root,
    state,
    vault: "notes",
    platform: "mac",
    name: "Mac",
    request: f.request,
  });
  assert.equal(f.issued(), 1);
  assert.equal(JSON.parse(await readFile(a.file, "utf8")).server, state.server);
  assert.equal((await stat(a.file)).mode & 0o777, 0o600);
  assert.equal((await stat(a.zipPath)).mode & 0o777, 0o600);
  assert.equal((await readFile(a.zipPath)).readUInt32LE(0), 0x04034b50);
});
test("setup refuses unrelated same-name databases and account switching before deployment", async (t) => {
  const f = await fixture(t);
  f.markExisting();
  await assert.rejects(provision({ ...f, log: () => {} }), /同名现有 D1/);
  assert.equal(
    f.commands.some((c) => c[0] === "deploy" || c[1] === "create"),
    false,
  );
  await assert.rejects(
    provision({ ...f, accountId: "b".repeat(32), log: () => {} }),
    /已绑定其他项目/,
  );
});
