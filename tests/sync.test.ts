import { test } from "node:test";
import assert from "node:assert/strict";
import { sha } from "../backend/src/hash.js";
import {
  sync,
  freshState,
  conflictPath,
  validPath,
  type Revision,
  type SyncState,
  type SyncIO,
} from "../packages/core/protocol.js";
function setup() {
  const remote = new Map<string, Revision>();
  const data = new Map<string, string>();
  let rev = 0;
  const client = (initial: Record<string, string> = {}) => {
    const local = new Map(Object.entries(initial));
    const state = freshState();
    const commit = (path: string, base: number, value: string | null) => {
      assert.equal(remote.get(path)?.rev ?? 0, base, "CAS failure");
      const r: Revision = {
        path,
        rev: ++rev,
        hash: value === null ? null : sha(value),
        chunks: [],
        size: value?.length ?? 0,
        deleted: value === null,
        device: "test",
        updatedAt: new Date().toISOString(),
      };
      remote.set(path, r);
      if (value !== null) data.set(r.rev + ":" + path, value);
      return r;
    };
    const io: SyncIO = {
      scan: async () =>
        [...local].map(([path, text]) => ({
          path,
          hash: sha(text),
          size: text.length,
        })),
      manifest: async () => structuredClone([...remote.values()]),
      upload: async (p, b) => commit(p, b, local.get(p)!),
      removeRemote: async (p, b) => commit(p, b, null),
      download: async (r) => {
        local.set(r.path, data.get(r.rev + ":" + r.path)!);
      },
      removeLocal: async (p) => {
        local.delete(p);
      },
      copyLocal: async (f, t) => {
        local.set(t, local.get(f)!);
      },
      save: async () => {},
    };
    return { local, state, io, run: () => sync(io, state) };
  };
  return { remote, client };
}
test("new vault: upload local, then second device downloads, repeated sync is idempotent", async () => {
  const s = setup(),
    a = s.client({ "a.md": "hello" }),
    b = s.client();
  assert.equal((await a.run()).uploaded, 1);
  assert.equal((await b.run()).downloaded, 1);
  assert.equal(b.local.get("a.md"), "hello");
  assert.deepEqual(await b.run(), {
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    conflicts: [],
  });
});
test("offline concurrent edits preserve local conflict and remote original", async () => {
  const s = setup(),
    a = s.client({ "a.md": "base" }),
    b = s.client();
  await a.run();
  await b.run();
  a.local.set("a.md", "first");
  b.local.set("a.md", "second");
  await a.run();
  const r = await b.run();
  assert.equal(r.conflicts.length, 1);
  assert.equal(b.local.get("a.md"), "first");
  assert.equal(b.local.get(conflictPath("a.md", sha("second"))), "second");
  await a.run();
  assert.equal(a.local.get(r.conflicts[0]), "second");
});
test("delete propagates and does not resurrect after reconnect", async () => {
  const s = setup(),
    a = s.client({ "a.md": "base" }),
    b = s.client();
  await a.run();
  await b.run();
  a.local.delete("a.md");
  await a.run();
  await b.run();
  assert.equal(b.local.has("a.md"), false);
  await b.run();
  assert.equal(s.remote.get("a.md")?.deleted, true);
});
test("remote deletion concurrent local edit preserves local in conflict copy", async () => {
  const s = setup(),
    a = s.client({ "a.md": "base" }),
    b = s.client();
  await a.run();
  await b.run();
  a.local.delete("a.md");
  b.local.set("a.md", "unsent");
  await a.run();
  const r = await b.run();
  assert.equal(b.local.has("a.md"), false);
  assert.equal(b.local.get(r.conflicts[0]), "unsent");
});
test("local deletion concurrent remote edit restores edited remote", async () => {
  const s = setup(),
    a = s.client({ "a.md": "base" }),
    b = s.client();
  await a.run();
  await b.run();
  a.local.set("a.md", "valuable");
  b.local.delete("a.md");
  await a.run();
  assert.equal((await b.run()).conflicts.length, 1);
  assert.equal(b.local.get("a.md"), "valuable");
});
test("initial local and remote collisions preserve both", async () => {
  const s = setup(),
    a = s.client({ "a.md": "a" }),
    b = s.client({ "a.md": "b" });
  await a.run();
  const r = await b.run();
  assert.equal(b.local.get("a.md"), "a");
  assert.equal(b.local.get(r.conflicts[0]), "b");
});
test("failed upload never advances local base", async () => {
  const s = setup(),
    a = s.client({ "a.md": "a" });
  a.io.upload = async () => {
    throw Error("network");
  };
  await assert.rejects(a.run(), /network/);
  assert.deepEqual(Object.keys(a.state.files), []);
});
test("a sync interrupted after commit can reconcile identical content without duplicate revision", async () => {
  const s = setup(),
    a = s.client({ "a.md": "a" });
  await a.run();
  a.state.files = {};
  const before = s.remote.get("a.md")!.rev;
  await a.run();
  assert.equal(s.remote.get("a.md")!.rev, before);
});
test("edited conflict copy is never overwritten", async () => {
  const s = setup(),
    a = s.client({ "a.md": "a" }),
    b = s.client({ "a.md": "b", [conflictPath("a.md", sha("b"))]: "edited" });
  await a.run();
  await assert.rejects(b.run(), /冲突副本已被编辑/);
});
test("paths reject traversal, hidden metadata, windows escape and prototype keys", () => {
  for (const p of [
    "../a",
    "/a",
    "a/../../b",
    ".obsidian/data.json",
    "a\\b",
    "a//b",
    "__proto__",
    "constructor",
    "a/\u0000",
  ])
    assert.equal(validPath(p), false, p);
  for (const p of ["收集箱/文章.md", "a b.png", "a/b/c.md"])
    assert.equal(validPath(p), true, p);
});

test("unchanged vault does not rewrite the sync baseline", async () => {
  const s = setup(),
    a = s.client({ "a.md": "unchanged", "b.md": "another" });
  let saves = 0;
  a.io.save = async () => {
    saves++;
  };
  await a.run();
  assert.equal(saves, 2);
  saves = 0;
  await a.run();
  assert.equal(saves, 0);
});

test("ten thousand unchanged paths require no uploads, downloads or state writes", async () => {
  const state = freshState();
  const files: Array<{ path: string; hash: string; size: number }> = [];
  const manifest: Revision[] = [];
  for (let i = 0; i < 10000; i++) {
    const path = `archive/${i}.md`,
      hash = "a".repeat(64);
    state.files[path] = { rev: i + 1, hash };
    files.push({ path, hash, size: 512 * 1024 });
    manifest.push({
      path,
      hash,
      size: 512 * 1024,
      rev: i + 1,
      chunks: [],
      deleted: false,
      device: "test",
      updatedAt: new Date(0).toISOString(),
    });
  }
  let writes = 0;
  const unexpected = async (): Promise<never> => {
    throw Error("unchanged vault must not mutate");
  };
  const result = await sync(
    {
      scan: async () => files,
      manifest: async () => manifest,
      upload: unexpected,
      removeRemote: unexpected,
      download: unexpected,
      removeLocal: unexpected,
      copyLocal: unexpected,
      save: async () => {
        writes++;
      },
    },
    state,
  );
  assert.equal(writes, 0);
  assert.equal(result.uploaded, 0);
  assert.equal(result.downloaded, 0);
});
