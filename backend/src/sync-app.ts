import { readFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import {
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  validPath,
  type Mutation,
} from "../../packages/core/protocol.js";
import { type SyncStore, type Device, Conflict, Limit } from "./model.js";
import type { Blobs } from "./blobs.js";
import { sha } from "./hash.js";
import { syncDashboard } from "./sync-dashboard.js";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const mutation = z.object({
  path: z.string().refine(validPath, "不允许的文件路径"),
  baseRev: z.number().int().min(0),
  hash: hash.nullable(),
  chunks: z.array(hash).max(256),
  size: z.number().int().min(0).max(MAX_FILE_SIZE),
});
const secure = (a: string | undefined, b: string | undefined) =>
  !!a &&
  !!b &&
  a.length >= 24 &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export interface Config {
  adminToken: string;
  deviceToken?: string;
  vault: string;
  assets?: { fetch(request: Request): Promise<Response> };
  readOnly?: boolean;
  provider?: "cloudflare" | "legacy";
}
export function createApp(store: SyncStore, blobs: Blobs, c: Config) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  async function body(req: Request, limit = 2 * 1024 * 1024) {
    let n = 0;
    const parts: Uint8Array[] = [];
    if (req.body)
      for await (const p of req.body as any) {
        n += p.length;
        if (n > limit) throw new Limit("请求过大");
        parts.push(p);
      }
    return Buffer.concat(parts);
  }
  return async function app(req: Request): Promise<Response> {
    try {
      const u = new URL(req.url);
      const p = u.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
      if (
        c.readOnly &&
        !["GET", "HEAD"].includes(req.method) &&
        !["/admin/devices", "/admin/revoke"].includes(p)
      )
        return json(
          { error: "服务迁移中，请稍后使用新的 Cloudflare 地址" },
          503,
        );
      const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
      if (p === "/" && req.method === "GET")
        return new Response(syncDashboard, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy":
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
            "x-content-type-options": "nosniff",
          },
        });
      if (p === "/plugin.zip" && req.method === "GET") {
        if (c.assets)
          return c.assets.fetch(
            new Request(new URL("/ob-collector-0.3.0.zip", req.url), req),
          );
        return new Response(
          new Uint8Array(
            await readFile(
              new URL("../../public/ob-collector-0.3.0.zip", import.meta.url),
            ),
          ),
          {
            headers: {
              "content-type": "application/zip",
              "content-disposition":
                "attachment; filename=ob-collector-0.3.0.zip",
            },
          },
        );
      }
      if (p === "/health")
        return json({
          ok: true,
          version: "0.3.0",
          mode: "vault-sync",
          readOnly: !!c.readOnly,
          provider: c.provider || "legacy",
        });
      if (
        [
          "/capture",
          "/collections",
          "/retry",
          "/ingest",
          "/cron",
          "/wecom/callback",
          "/admin/drain",
          "/admin/archive",
        ].includes(p)
      )
        return json({ error: "收藏入口已停用，此服务仅用于仓库同步" }, 410);
      if (p.startsWith("/admin/")) {
        if (!secure(c.adminToken, bearer))
          return json({ error: "管理员凭据无效" }, 401);
        if (p === "/admin/devices" && req.method === "POST") {
          const d = z
            .object({
              name: z.string().min(1).max(80),
              vault: id.default(c.vault),
            })
            .parse(JSON.parse((await body(req)).toString()));
          const token = randomUUID() + randomUUID();
          const device: Device = {
            id: randomUUID(),
            vault: d.vault,
            name: d.name,
            tokenHash: sha(token),
            revoked: false,
          };
          await store.addDevice(device);
          return json({ id: device.id, token, vault: device.vault });
        }
        if (p === "/admin/revoke" && req.method === "POST") {
          const d = z
            .object({ id: z.string(), vault: id.default(c.vault) })
            .parse(JSON.parse((await body(req)).toString()));
          await store.revokeDevice(d.vault, d.id);
          return json({ ok: true });
        }
        if (p === "/admin/devices" && req.method === "GET")
          return json({
            devices: (
              await store.devices(
                id.parse(u.searchParams.get("vault") || c.vault),
              )
            ).map(({ tokenHash, ...d }) => d),
          });
        return json({ error: "接口不存在" }, 404);
      }
      let device = bearer ? await store.device(sha(bearer)) : undefined;
      if (!device && secure(c.deviceToken, bearer))
        device = {
          id: "personal-bootstrap",
          vault: c.vault,
          name: "个人设备",
          tokenHash: sha(bearer!),
          revoked: false,
        };
      if (!device) return json({ error: "设备凭据无效，请先绑定" }, 401);
      const vault = device.vault;
      if (p === "/identity" && req.method === "GET")
        return json({ id: device.id, name: device.name, vault: device.vault });
      if (p === "/backup" && req.method === "GET")
        return json({
          schema: 1,
          createdAt: new Date().toISOString(),
          vault,
          revisions: await store.revisions(vault),
        });
      if (p === "/manifest" && req.method === "GET") {
        const tag =
          '"' + sha(vault).slice(0, 16) + "-" + (await store.head(vault)) + '"';
        if (
          (req.headers.get("if-none-match") || "").split(",").some((value) => {
            const candidate = value.trim();
            return candidate === "*" || candidate.replace(/^W\//, "") === tag;
          })
        )
          return new Response(null, {
            status: 304,
            headers: { etag: tag, "cache-control": "private, no-cache" },
          });
        const response = json({ files: await store.manifest(vault) });
        response.headers.set("etag", tag);
        return response;
      }
      if (p === "/chunks" && req.method === "PUT") {
        const data = await body(req, CHUNK_SIZE);
        if (!data.length) throw new Error("空块无需上传");
        return json({ hash: await blobs.write(vault, data) });
      }
      if (p.startsWith("/chunks/") && req.method === "GET") {
        const h = hash.parse(p.slice(8));
        return new Response(new Uint8Array(await blobs.read(vault, h)), {
          headers: {
            "content-type": "application/octet-stream",
            "cache-control": "private, no-store",
          },
        });
      }
      if (p === "/commit" && req.method === "POST") {
        const change = mutation.parse(JSON.parse((await body(req)).toString()));
        if (change.hash === null) {
          if (change.size !== 0 || change.chunks.length)
            throw new Error("删除记录不应携带内容");
        } else {
          const hasher = createHash("sha256");
          let size = 0;
          for (const h of change.chunks) {
            const b = await blobs.read(vault, h);
            if (b.length > CHUNK_SIZE) throw new Error("附件块过大");
            size += b.length;
            hasher.update(b);
          }
          if (size !== change.size || hasher.digest("hex") !== change.hash)
            throw new Error("文件完整性校验失败");
        }
        return json(await store.commit(vault, device.id, change));
      }
      if (p === "/history" && req.method === "GET") {
        const path = u.searchParams.get("path") ?? "";
        if (!validPath(path)) return json({ error: "路径无效" }, 400);
        return json({ files: await store.history(vault, path) });
      }
      if (p === "/restore" && req.method === "POST") {
        const d = z
          .object({
            path: z.string().refine(validPath),
            rev: z.number().int(),
            baseRev: z.number().int().min(0),
          })
          .parse(JSON.parse((await body(req)).toString()));
        const history = await store.history(vault, d.path);
        const old = history.find((r) => r.rev === d.rev);
        if (!old) return json({ error: "历史版本不存在" }, 404);
        return json(
          await store.commit(vault, device.id, { ...old, baseRev: d.baseRev }),
        );
      }
      return json({ error: "接口不存在" }, 404);
    } catch (e) {
      if (e instanceof Conflict)
        return json({ error: e.message, current: e.current }, 409);
      if (e instanceof Limit) return json({ error: e.message }, 413);
      if (e instanceof z.ZodError)
        return json(
          {
            error: "输入格式无效",
            issues: e.issues.map((x) => ({ path: x.path, message: x.message })),
          },
          400,
        );
      console.error("request_failed", e instanceof Error ? e.name : "Error");
      return json(
        { error: e instanceof Error ? e.message : "服务处理失败" },
        400,
      );
    }
  };
}
