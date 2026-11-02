import { createHash } from "node:crypto";
export const sha = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
