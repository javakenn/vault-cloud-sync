import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";


import { freshState } from "../packages/core/protocol.js";
const cloud = process.env.OB_CLOUD_TEST_CONFIG
  ? JSON.parse(await readFile(process.env.OB_CLOUD_TEST_CONFIG, "utf8"))
  : undefined;
const token = cloud?.token || "test-plugin-device-token-123456789";
class File {
  stat: { size: number; mtime: number };
  constructor(
    public path: string,
    public bytes: ArrayBuffer,
  ) {
    this.stat = { size: bytes.byteLength, mtime: Date.now() };
  }
}
const ab = (b: Buffer) => new Uint8Array(b).buffer;
async function harness(t: any) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: ".data/cloudflare-build/worker.js",
    compatibilityDate: "2026-10-30", compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"], r2Buckets: ["FILES"],
    bindings: { ADMIN_TOKEN: "test-admin-token-1234567890123", DEVICE_TOKEN: token, VAULT_ID: "personal" },
    serviceBindings: { ASSETS: async () => new Response("") },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  for (const sql of (await readFile("cloudflare/migrations/0001_sync.sql", "utf8")).split(";").filter(x => x.trim())) await db.prepare(sql).run();
  const { createHash } = await import("node:crypto");
  await db.prepare("INSERT INTO ob_devices(id,vault,name,token_hash,revoked) VALUES(?,?,?,?,0)").bind("fixture", "personal", "Fixture", createHash("sha256").update(token).digest("hex")).run();
  const app = async (request: Request) => mf.dispatchFetch(request.url, { method: request.method, headers: Object.fromEntries(request.headers), body: request.body ? await request.arrayBuffer() : undefined });
  const notices: string[] = [];
  const source = await readFile("dist/ob-collector/main.js", "utf8");
  const api = async (o: any) => {
    const request = new Request(o.url, {
      method: o.method,
      headers: o.headers,
      body: o.body instanceof ArrayBuffer ? new Uint8Array(o.body) : o.body,
    });
    const r = cloud ? await fetch(request) : await app(request);
    const bytes = await r.arrayBuffer();
    let json;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {}
    return {
      status: r.status,
      arrayBuffer: bytes,
      json,
      headers: Object.fromEntries(r.headers),
    };
  };
  const sandbox: any = {
    module: { exports: {} },
    exports: {},
    require: () => ({
      Plugin: class {
        saveData = async () => {};
      },
      PluginSettingTab: class {},
      Modal: class {},
      Setting: class {},
      Notice: class {
        constructor(m: string) {
          notices.push(m);
        }
      },
      TFile: File,
      normalizePath: (s: string) => s,
      requestUrl: api,
    }),
    console,
    crypto: webcrypto,
    URL,
    ArrayBuffer,
    Uint8Array,
    Map,
    Set,
    Date,
    AbortSignal,
  };
  vm.runInNewContext(source, sandbox);
  const Client = sandbox.module.exports.default;
  let clientNumber = 0;
  function client(initial: Record<string, Buffer> = {}) {
    const files = new Map<string, File>(
      Object.entries(initial).map(([path, b]) => [path, new File(path, ab(b))]),
    );
    const folders = new Set<string>();
    const plugin = new Client();
    plugin.settings = {
      server: cloud?.server || "http://localhost:8787",
      token: cloud?.tokens?.[clientNumber++] || token,
      enabled: true,
      interval: 60,
      state: freshState(),
    };
    plugin.status = { setText: (s: string) => (plugin.statusText = s) };
    plugin.app = {
      vault: {
        getFiles: () => [...files.values()],
        getAbstractFileByPath: (p: string) =>
          files.get(p) ?? (folders.has(p) ? {} : null),
        readBinary: async (f: File) => f.bytes.slice(0),
        createFolder: async (p: string) => {
          folders.add(p);
        },
        createBinary: async (p: string, b: ArrayBuffer) => {
          const f = new File(p, b.slice(0));
          files.set(p, f);
          return f;
        },
        modifyBinary: async (f: File, b: ArrayBuffer) => {
          f.bytes = b.slice(0);
          f.stat.size = b.byteLength;
        },
      },
      fileManager: {
        trashFile: async (f: File) => {
          files.delete(f.path);
        },
      },
    };
    return {
      plugin,
      files,
      put: (p: string, value: string) =>
        files.set(p, new File(p, ab(Buffer.from(value)))),
      text: (p: string) =>
        files.has(p)
          ? new TextDecoder().decode(files.get(p)!.bytes)
          : undefined,
    };
  }
  return { client, app, notices };
}
test("actual packaged plugin transfers binary chunks and synchronizes two devices", async (t) => {
  const h = await harness(t);
  const large = Buffer.alloc(2 * 1024 * 1024 + 123, 173);
  const a = h.client({
      "笔记.md": Buffer.from("最初内容"),
      "图片/test.png": large,
    }),
    b = h.client();
  await a.plugin.run(true);
  assert.match(a.plugin.statusText, /已同步/);
  await b.plugin.run(true);
  assert.equal(b.text("笔记.md"), "最初内容");
  assert.deepEqual(Buffer.from(b.files.get("图片/test.png")!.bytes), large);
  a.put("笔记.md", "Mac 离线修改");
  b.put("笔记.md", "手机离线修改");
  await a.plugin.run(true);
  await b.plugin.run(true);
  assert.equal(b.text("笔记.md"), "Mac 离线修改");
  const conflict = [...b.files.keys()].find((p) => p.includes("conflict"))!;
  assert.equal(b.text(conflict), "手机离线修改");
  await a.plugin.run(true);
  assert.equal(a.text(conflict), "手机离线修改");
  a.files.delete("图片/test.png");
  await a.plugin.run(true);
  await b.plugin.run(true);
  assert.equal(b.files.has("图片/test.png"), false);
});
test("actual plugin synchronizes files saved by another collection tool", async (t) => {
  const h = await harness(t);
  const text = Buffer.from("由独立收藏工具写入本地仓库的笔记");
  const image = Buffer.alloc(1024, 71);
  const a = h.client({
      "收集箱/外部收藏.md": text,
      "附件/外部图片.png": image,
    }),
    b = h.client();
  await a.plugin.run(true);
  await b.plugin.run(true);
  assert.equal(b.text("收集箱/外部收藏.md"), text.toString());
  assert.deepEqual(Buffer.from(b.files.get("附件/外部图片.png")!.bytes), image);
});
test("plugin refuses to overwrite file edited while remote manifest is being fetched", async (t) => {
  const h = await harness(t),
    a = h.client({ "a.md": Buffer.from("base") }),
    b = h.client();
  await a.plugin.run(true);
  await b.plugin.run(true);
  a.put("a.md", "remote edit");
  await a.plugin.run(true);
  const original = b.plugin.api.bind(b.plugin);
  b.plugin.api = async (path: string, ...rest: any[]) => {
    const response = await original(path, ...rest);
    if (path === "/manifest") b.put("a.md", "typed during sync");
    return response;
  };
  await b.plugin.run(true);
  assert.equal(b.text("a.md"), "typed during sync");
  assert.match(b.plugin.statusText, /需要处理/);
});
