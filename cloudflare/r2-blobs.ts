import type { R2Bucket } from "@cloudflare/workers-types";
import { sha } from "../backend/src/hash.js";
import type { Blobs } from "../backend/src/blobs.js";
export class R2Blobs implements Blobs {
  constructor(private bucket: R2Bucket) {}
  private key(vault: string, hash: string) {
    return "vaults/" + sha(vault) + "/" + hash;
  }
  async read(vault: string, hash: string) {
    const obj = await this.bucket.get(this.key(vault, hash));
    if (!obj) throw Error("附件块不存在");
    return Buffer.from(await obj.arrayBuffer());
  }
  async write(vault: string, data: Buffer) {
    const hash = sha(data);
    await this.bucket.put(this.key(vault, hash), new Uint8Array(data), {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    return hash;
  }
}
