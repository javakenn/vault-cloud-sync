export const CHUNK_SIZE = 1024 * 1024;
export const MAX_FILE_SIZE = 256 * 1024 * 1024;
export interface Revision {
  path: string;
  rev: number;
  hash: string | null;
  chunks: string[];
  size: number;
  deleted: boolean;
  updatedAt: string;
  device: string;
}
export interface Base {
  rev: number;
  hash: string | null;
}
export interface SyncState {
  schema: 1;
  files: Record<string, Base>;
}
export interface LocalFile {
  path: string;
  hash: string;
  size: number;
}
export interface Mutation {
  path: string;
  baseRev: number;
  hash: string | null;
  chunks: string[];
  size: number;
}
export const freshState = (): SyncState => ({
  schema: 1,
  files: Object.create(null) as Record<string, Base>,
});
export function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 700 &&
    !path.includes("\\") &&
    !Array.from(path).some((c) => c.charCodeAt(0) < 32) &&
    !path.startsWith("/") &&
    path
      .split("/")
      .every(
        (p) =>
          !!p &&
          p !== "." &&
          p !== ".." &&
          !p.startsWith(".") &&
          !["__proto__", "constructor", "prototype"].includes(p),
      )
  );
}
export function conflictPath(path: string, hash: string): string {
  const i = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return i > slash
    ? `${path.slice(0, i)} (conflict ${hash.slice(0, 12)})${path.slice(i)}`
    : `${path} (conflict ${hash.slice(0, 12)})`;
}
export interface SyncIO {
  scan(): Promise<LocalFile[]>;
  manifest(): Promise<Revision[]>;
  upload(path: string, baseRev: number): Promise<Revision>;
  removeRemote(path: string, baseRev: number): Promise<Revision>;
  download(revision: Revision): Promise<void>;
  removeLocal(path: string): Promise<void>;
  copyLocal(from: string, to: string): Promise<void>;
  save(state: SyncState): Promise<void>;
  signal?: AbortSignal;
}
export interface SyncResult {
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: string[];
}
// Sync is serialized per client. CAS on the server prevents silent overwrites across devices.
export async function sync(io: SyncIO, state: SyncState): Promise<SyncResult> {
  const result: SyncResult = {
    uploaded: 0,
    downloaded: 0,
    deleted: 0,
    conflicts: [],
  };
  const local = new Map((await io.scan()).map((f) => [f.path, f]));
  const remote = new Map((await io.manifest()).map((f) => [f.path, f]));
  const paths = [
    ...new Set([
      ...local.keys(),
      ...remote.keys(),
      ...Object.keys(state.files),
    ]),
  ].sort();
  const remember = async (r: Revision) => {
    const previous = state.files[r.path];
    if (
      previous?.rev === r.rev &&
      previous.hash === (r.deleted ? null : r.hash)
    )
      return;
    state.files[r.path] = { rev: r.rev, hash: r.deleted ? null : r.hash };
    await io.save(state);
  };
  for (const path of paths) {
    io.signal?.throwIfAborted();
    const l = local.get(path);
    const r = remote.get(path);
    const b = state.files[path];
    const lh = l?.hash ?? null,
      rh = r?.deleted ? null : (r?.hash ?? null);
    if (lh === rh) {
      if (r) await remember(r);
      continue;
    }
    const localChanged = lh !== (b?.hash ?? null);
    const remoteChanged = (r?.rev ?? 0) !== (b?.rev ?? 0);
    if (localChanged && remoteChanged) {
      if (l) {
        const cp = conflictPath(path, l.hash);
        // If this deterministic conflict copy already exists with different content, never overwrite it.
        const existing = local.get(cp);
        if (existing && existing.hash !== l.hash)
          throw new Error(`冲突副本已被编辑，请先重命名：${cp}`);
        const rr = remote.get(cp);
        if (rr && !rr.deleted && rr.hash !== l.hash)
          throw new Error(`云端冲突副本已被编辑：${cp}`);
        await io.copyLocal(path, cp);
        if (!rr || rr.deleted) {
          await remember(await io.upload(cp, rr?.rev ?? 0));
          result.uploaded++;
        }
        result.conflicts.push(cp);
      } else {
        // Concurrent delete/edit keeps the edited remote content for recovery.
        result.conflicts.push(path);
      }
      if (r && !r.deleted) {
        await io.download(r);
        result.downloaded++;
      } else if (l) {
        await io.removeLocal(path);
        result.deleted++;
      }
      if (r) await remember(r);
    } else if (localChanged) {
      const updated = l
        ? await io.upload(path, r?.rev ?? 0)
        : await io.removeRemote(path, r?.rev ?? b?.rev ?? 0);
      await remember(updated);
      l ? result.uploaded++ : result.deleted++;
    } else if (remoteChanged && r) {
      if (r.deleted) {
        if (l) await io.removeLocal(path);
        result.deleted++;
      } else {
        await io.download(r);
        result.downloaded++;
      }
      await remember(r);
    }
  }
  return result;
}
