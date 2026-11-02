export interface Blobs {
  read(vault: string, hash: string): Promise<Buffer>;
  write(vault: string, data: Buffer): Promise<string>;
}
