import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { D1Store } from "../cloudflare/d1-store.js";
import { Conflict, Limit } from "../backend/src/model.js";
import { sha } from "../backend/src/hash.js";
const admin = "cloudflare-test-admin-123456789";
async function fixture(t: any, readOnly = false) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "sync-tests",
      modules: true,
      scriptPath: ".data/cloudflare-build/worker.js",
      compatibilityDate: "2026-10-30",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
      bindings: {
        ADMIN_TOKEN: admin,
        VAULT_ID: "notes",
        READ_ONLY: readOnly ? "1" : "0",
      },
      serviceBindings: {
        ASSETS: async () =>
          new Response(await readFile("public/ob-collector-0.3.0.zip")),
      },
    }),
  );
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const schema = await readFile("cloudflare/migrations/0001_sync.sql", "utf8");
  for (const sql of schema.split(";").filter((x) => x.trim()))
    await db.prepare(sql).run();
  const store = new D1Store(db as any);
  const call = (
    path: string,
    token = "",
    method = "GET",
    body?: unknown,
    binary?: Buffer,
  ) =>
    mf.dispatchFetch("https://test/api" + path, {
      method,
      headers: { authorization: "Bearer " + token },
      body: binary
        ? new Uint8Array(binary)
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  const issue = async (vault: string, name: string): Promise<any> =>
    (await call("/admin/devices", admin, "POST", { vault, name })).json();
  return { mf, db, store, call, issue };
}
test("actual Cloudflare Worker uses D1/R2 for authenticated file lifecycle and assets", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("/health")).status, 200);
  const a = await f.issue("notes", "Mac"),
    b = await f.issue("other", "Phone");
  const data = Buffer.from("Cloudflare 独立存储验证"),
    hash = sha(data);
  assert.equal(
    (await f.call("/chunks", a.token, "PUT", undefined, data)).status,
    200,
  );
  const first: any = await (
    await f.call("/commit", a.token, "POST", {
      path: "测试.md",
      baseRev: 0,
      hash,
      chunks: [hash],
      size: data.length,
    })
  ).json();
  assert.equal(first.rev, 1);
  const download = await f.call("/chunks/" + hash, a.token);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), data);
  assert.equal((await f.call("/manifest", "bad")).status, 401);
  assert.equal((await f.call("/chunks/" + hash, b.token)).status, 400);
  const deleted: any = await (
    await f.call("/commit", a.token, "POST", {
      path: "测试.md",
      baseRev: first.rev,
      hash: null,
      chunks: [],
      size: 0,
    })
  ).json();
  assert.ok(deleted.deleted);
  const restored: any = await (
    await f.call("/restore", a.token, "POST", {
      path: "测试.md",
      baseRev: deleted.rev,
      rev: first.rev,
    })
  ).json();
  assert.equal(restored.hash, hash);
  const zip = await f.mf.dispatchFetch("https://test/plugin.zip");
  assert.equal(
    Buffer.from(await zip.arrayBuffer()).readUInt32LE(0),
    0x04034b50,
  );
  const list: any = await (
    await f.call("/admin/devices?vault=notes", admin)
  ).json();
  assert.equal(list.devices.length, 1);
  assert.ok(!("tokenHash" in list.devices[0]));
  await f.call("/admin/revoke", admin, "POST", { vault: "notes", id: a.id });
  assert.equal((await f.call("/manifest", a.token)).status, 401);
});
test("D1 concurrent CAS accepts one writer and quota failures cannot advance revision or usage", async (t) => {
  const f = await fixture(t),
    c = { path: "a.md", hash: sha("a"), chunks: [], size: 1, baseRev: 0 };
  const results = await Promise.allSettled([
    f.store.commit("v", "one", c),
    f.store.commit("v", "two", c),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failed = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(failed.reason instanceof Conflict);
  assert.equal(await f.store.head("v"), 1);
  assert.equal((await f.store.revisions("v")).length, 1);
  const limited = new D1Store(f.db as any, 1);
  await assert.rejects(
    limited.commit("v", "three", { ...c, baseRev: 1 }),
    Limit,
  );
  assert.equal(await f.store.head("v"), 1);
  const used: any = await f.db
    .prepare("SELECT used_bytes FROM ob_vaults WHERE id=?")
    .bind("v")
    .first();
  assert.equal(used.used_bytes, 1);
  const next = await f.store.commit("v", "three", { ...c, baseRev: 1 });
  assert.equal(next.rev, 2);
  assert.equal(await f.store.head("v"), 2);
});

test("Cloudflare read-only cutover freezes note writes while retaining authenticated export access", async (t) => {
  const f = await fixture(t, true);
  const health: any = await (await f.call("/health")).json();
  assert.equal(health.readOnly, true);
  assert.equal(
    (
      await f.call("/admin/devices", "bad", "POST", {
        name: "bad",
        vault: "notes",
      })
    ).status,
    401,
  );
  const a = await f.issue("notes", "导出设备");
  assert.equal((await f.call("/backup", a.token)).status, 200);
  assert.equal(
    (await f.call("/chunks", a.token, "PUT", undefined, Buffer.from("freeze")))
      .status,
    503,
  );
  assert.equal((await f.call("/commit", a.token, "POST", {})).status, 503);
  assert.equal((await f.call("/restore", a.token, "POST", {})).status, 503);
});
test("D1 transaction rolls back both metadata and inserted revision when accounting fails", async (t) => {
  const f = await fixture(t);
  await f.db
    .prepare(
      "CREATE TRIGGER fail_accounting BEFORE UPDATE ON ob_vaults WHEN NEW.id='rollback' BEGIN SELECT RAISE(ABORT,'forced accounting failure'); END",
    )
    .run();
  await assert.rejects(
    f.store.commit("rollback", "device", {
      path: "x.md",
      baseRev: 0,
      hash: sha("x"),
      chunks: [],
      size: 1,
    }),
  );
  assert.equal(await f.store.head("rollback"), 0);
  assert.deepEqual(await f.store.revisions("rollback"), []);
});

test("compressed weak ETags retain authenticated 304 semantics", async (t) => {
  const f = await fixture(t);
  const a = await f.issue("notes", "Mac");
  const first = await f.call("/manifest", a.token);
  const tag = first.headers.get("etag");
  assert.ok(tag);
  for (const value of [tag, "W/" + tag, '"outdated", W/' + tag, "*"]) {
    const r = await f.mf.dispatchFetch("https://test/api/manifest", {
      headers: { authorization: "Bearer " + a.token, "if-none-match": value },
    });
    assert.equal(r.status, 304);
    assert.equal(await r.text(), "");
  }
  const outdated = await f.mf.dispatchFetch("https://test/api/manifest", {
    headers: {
      authorization: "Bearer " + a.token,
      "if-none-match": 'W/"outdated"',
    },
  });
  assert.equal(outdated.status, 200);
  const unauth = await f.mf.dispatchFetch("https://test/api/manifest", {
    headers: { "if-none-match": "W/" + tag },
  });
  assert.equal(unauth.status, 401);
});
