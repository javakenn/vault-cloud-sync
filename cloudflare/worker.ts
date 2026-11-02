import type { D1Database, R2Bucket, Fetcher } from "@cloudflare/workers-types";
import { createApp } from "../backend/src/sync-app.js";
import { D1Store } from "./d1-store.js";
import { R2Blobs } from "./r2-blobs.js";
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_TOKEN: string;
  VAULT_ID?: string;
  READ_ONLY?: string;
}
export default {
  async fetch(request: Request, env: Env) {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24)
      return Response.json({ error: "服务凭据未配置" }, { status: 503 });
    return createApp(new D1Store(env.DB), new R2Blobs(env.FILES), {
      adminToken: env.ADMIN_TOKEN,
      provider: "cloudflare",
      vault: env.VAULT_ID || "notes",
      assets: {
        fetch: (req: Request) =>
          env.ASSETS.fetch(req as any) as unknown as Promise<Response>,
      },
      readOnly: env.READ_ONLY === "1",
    })(request);
  },
};
