import type { D1Database } from "@cloudflare/workers-types";
import {
  Conflict,
  Limit,
  type SyncStore,
  type Device,
} from "../backend/src/model.js";
import type { Mutation, Revision } from "../packages/core/protocol.js";
const revision = (r: any): Revision => ({
  path: r.path,
  rev: Number(r.rev),
  hash: r.hash,
  chunks: JSON.parse(r.chunks),
  size: Number(r.size),
  deleted: !!r.deleted,
  device: r.device,
  updatedAt: r.updated_at,
});
const device = (r: any): Device => ({
  id: r.id,
  vault: r.vault,
  name: r.name,
  tokenHash: r.token_hash,
  revoked: !!r.revoked,
});
export class D1Store implements SyncStore {
  constructor(
    private db: D1Database,
    private quota = 10 * 1024 ** 3,
  ) {}
  async init() {
    await this.db.prepare("SELECT 1").first();
  }
  async device(hash: string) {
    const r = await this.db
      .prepare("SELECT * FROM ob_devices WHERE token_hash=? AND revoked=0")
      .bind(hash)
      .first();
    return r ? device(r) : undefined;
  }
  async devices(vault: string) {
    const r = await this.db
      .prepare("SELECT * FROM ob_devices WHERE vault=? ORDER BY name,id")
      .bind(vault)
      .all();
    return r.results.map(device);
  }
  async addDevice(d: Device) {
    await this.db
      .prepare(
        "INSERT INTO ob_devices(id,vault,name,token_hash,revoked) VALUES(?,?,?,?,?)",
      )
      .bind(d.id, d.vault, d.name, d.tokenHash, d.revoked ? 1 : 0)
      .run();
  }
  async revokeDevice(vault: string, id: string) {
    await this.db
      .prepare("UPDATE ob_devices SET revoked=1 WHERE vault=? AND id=?")
      .bind(vault, id)
      .run();
  }
  async head(vault: string) {
    return Number(
      (await this.db
        .prepare("SELECT next_rev FROM ob_vaults WHERE id=?")
        .bind(vault)
        .first("next_rev")) ?? 0,
    );
  }
  async manifest(vault: string) {
    const r = await this.db
      .prepare(
        "SELECT r.* FROM ob_revisions r WHERE r.vault=? AND r.rev=(SELECT MAX(v.rev) FROM ob_revisions v WHERE v.vault=r.vault AND v.path=r.path) ORDER BY r.path",
      )
      .bind(vault)
      .all();
    return r.results.map(revision);
  }
  async revisions(vault: string) {
    const r = await this.db
      .prepare("SELECT * FROM ob_revisions WHERE vault=? ORDER BY rev")
      .bind(vault)
      .all();
    return r.results.map(revision);
  }
  async history(vault: string, path: string) {
    const r = await this.db
      .prepare(
        "SELECT * FROM ob_revisions WHERE vault=? AND path=? ORDER BY rev DESC LIMIT 100",
      )
      .bind(vault, path)
      .all();
    return r.results.map(revision);
  }
  async commit(vault: string, writer: string, c: Mutation): Promise<Revision> {
    // D1 batch is one SQLite transaction. CAS and quota are checked by the INSERT itself.
    const result = await this.db.batch([
      this.db
        .prepare("INSERT OR IGNORE INTO ob_vaults(id) VALUES(?)")
        .bind(vault),
      this.db
        .prepare(
          `INSERT INTO ob_revisions(vault,rev,path,hash,chunks,size,deleted,device,updated_at)
    SELECT id,next_rev+1,?,?,?,?,?,?,? FROM ob_vaults WHERE id=? AND used_bytes+?<=? AND
    COALESCE((SELECT rev FROM ob_revisions WHERE vault=? AND path=? ORDER BY rev DESC LIMIT 1),0)=? RETURNING *`,
        )
        .bind(
          c.path,
          c.hash,
          JSON.stringify(c.chunks),
          c.size,
          c.hash === null ? 1 : 0,
          writer,
          new Date().toISOString(),
          vault,
          c.size,
          this.quota,
          vault,
          c.path,
          c.baseRev,
        ),
      this.db
        .prepare(
          "UPDATE ob_vaults SET next_rev=next_rev+1,used_bytes=used_bytes+? WHERE id=? AND changes()=1",
        )
        .bind(c.size, vault),
    ]);
    const row = result[1].results[0];
    if (row) return revision(row);
    const current = (await this.history(vault, c.path))[0];
    if ((current?.rev ?? 0) !== c.baseRev) throw new Conflict(current);
    throw new Limit("版本存储配额不足");
  }
}
