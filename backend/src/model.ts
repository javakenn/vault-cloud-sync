import type { Mutation, Revision } from "../../packages/core/protocol.js";
export interface Device {
  id: string;
  vault: string;
  name: string;
  tokenHash: string;
  revoked: boolean;
}
export class Conflict extends Error {
  constructor(public current: Revision | undefined) {
    super("版本已变化，请重新同步");
  }
}
export class Limit extends Error {}

export interface SyncStore {
  init(): Promise<void>;
  device(hash: string): Promise<Device | undefined>;
  addDevice(d: Device): Promise<void>;
  devices(vault: string): Promise<Device[]>;
  revokeDevice(vault: string, id: string): Promise<void>;
  manifest(vault: string): Promise<Revision[]>;
  head(vault: string): Promise<number>;
  commit(vault: string, device: string, change: Mutation): Promise<Revision>;
  revisions(vault: string): Promise<Revision[]>;
  history(vault: string, path: string): Promise<Revision[]>;
}
