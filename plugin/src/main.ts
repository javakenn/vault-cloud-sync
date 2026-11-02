import { z } from "zod";
import {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  TFile,
  requestUrl,
  type App,
} from "obsidian";
import {
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  freshState,
  sync,
  validPath,
  type Revision,
  type SyncState,
  type SyncIO,
  type LocalFile,
} from "../../packages/core/protocol";
interface Settings {
  server: string;
  token: string;
  enabled: boolean;
  interval: number;
  vault: string;
  state: SyncState;
}
const defaults: Settings = {
  server: "",
  token: "",
  enabled: false,
  interval: 60,
  vault: "",
  state: freshState(),
};
async function hash(data: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const revisionSchema = z.object({
  path: z.string().refine(validPath),
  rev: z.number().int().positive(),
  hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  chunks: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(256),
  size: z.number().int().min(0).max(MAX_FILE_SIZE),
  deleted: z.boolean(),
  updatedAt: z.string(),
  device: z.string(),
});
const filesSchema = z.object({ files: z.array(revisionSchema) });
const identitySchema = z.object({
  id: z.string(),
  name: z.string(),
  vault: z.string(),
});
const connectionSchema = z.object({
  server: z.string(),
  token: z.string().min(24),
});
const settingsSchema = z.object({
  server: z.string(),
  token: z.string(),
  enabled: z.boolean(),
  interval: z.number().min(30),
  vault: z.string(),
  state: z.object({
    schema: z.literal(1),
    files: z.record(
      z.string().refine(validPath),
      z.object({ rev: z.number().int().min(0), hash: z.string().nullable() }),
    ),
  }),
});
type FileList = { files: Revision[] };
type ApiResult<P extends string> = P extends "/identity"
  ? z.infer<typeof identitySchema>
  : P extends "/manifest" | `/history?${string}`
    ? FileList
    : P extends "/chunks"
      ? { hash: string }
      : P extends `/chunks/${string}`
        ? ArrayBuffer
        : Revision;
export default class CollectorPlugin extends Plugin {
  declare settings: Settings;
  private busy = false;
  private alive = true;
  private status!: HTMLElement;
  private timer?: number;
  private saving = Promise.resolve();
  private manifestCache?: { tag: string; data: FileList };
  private hashes = new Map<
    string,
    { mtime: number; size: number; hash: string }
  >();
  async onload() {
    const raw: unknown = await this.loadData();
    const saved = settingsSchema.partial().parse(raw ?? {});
    this.settings = {
      ...defaults,
      ...saved,
      state: saved?.state ?? freshState(),
    };
    this.status = this.addStatusBarItem();
    this.status.setText("仓库云同步 · 未连接");
    this.registerDomEvent(this.status, "click", () => void this.run(true));
    this.addSettingTab(new CollectorSettings(this.app, this));
    this.addRibbonIcon(
      "refresh-cw",
      "仓库云同步：同步",
      () => void this.run(true),
    );
    this.addCommand({
      id: "sync",
      name: "立即同步",
      callback: () => void this.run(true),
    });
    this.addCommand({
      id: "history",
      name: "查看当前笔记历史 / 恢复",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        if (!checking) new HistoryModal(this.app, this, f.path).open();
        return true;
      },
    });
    this.addCommand({
      id: "deleted",
      name: "查看云端回收站",
      callback: () => void this.deleted(),
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.alive && this.settings.enabled) void this.run(false);
    });
    this.registerEvent(
      this.app.vault.on("modify", (f) => this.hashes.delete(f.path)),
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.hashes.delete(f.path)),
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, old) => {
        this.hashes.delete(old);
        this.hashes.delete(f.path);
      }),
    );
    this.schedule();
  }
  onunload() {
    this.alive = false;
    if (this.timer) window.clearInterval(this.timer);
  }
  schedule() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(
      () => {
        if (this.settings.enabled) void this.run(false);
      },
      Math.max(30, this.settings.interval) * 1000,
    );
    this.registerInterval(this.timer);
  }
  async save() {
    this.saving = this.saving
      .catch(() => {})
      .then(() => this.saveData(this.settings));
    await this.saving;
  }
  async api<P extends string>(
    path: P,
    method = "GET",
    body?: unknown,
    binary?: ArrayBuffer,
  ): Promise<ApiResult<P>> {
    const server = this.settings.server.replace(/\/$/, "");
    const url = new URL(server);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("服务地址必须使用 HTTPS；本机测试可用 HTTP");
    if (!this.settings.token) throw new Error("请先填写设备令牌");
    const r = await requestUrl({
      url: server + "/api" + path,
      method,
      headers: {
        Authorization: "Bearer " + this.settings.token,
        ...(path === "/manifest" && this.manifestCache
          ? { "If-None-Match": this.manifestCache.tag }
          : {}),
        "Content-Type": binary
          ? "application/octet-stream"
          : "application/json",
      },
      body: binary ?? (body === undefined ? undefined : JSON.stringify(body)),
      throw: false,
    });
    if (r.status === 304 && path === "/manifest" && this.manifestCache)
      return this.manifestCache.data as ApiResult<P>;
    if (r.status >= 400) {
      let message = "请求失败";
      try {
        const raw: unknown = r.json;
        const error = z.object({ error: z.string().optional() }).safeParse(raw);
        if (error.success && error.data.error) message = error.data.error;
      } catch {
        /* Binary or empty error responses may not contain JSON. */
      }
      throw new Error(`${r.status}: ${message}`);
    }
    if (path.startsWith("/chunks/")) return r.arrayBuffer as ApiResult<P>;
    const raw: unknown = r.json;
    if (path === "/manifest" || path.startsWith("/history?")) {
      const data = filesSchema.parse(raw);
      if (path === "/manifest") {
        const tag = Object.entries(r.headers).find(
          ([key]) => key.toLowerCase() === "etag",
        )?.[1];
        if (tag) this.manifestCache = { tag, data };
      }
      return data as ApiResult<P>;
    }
    if (path === "/identity") return identitySchema.parse(raw) as ApiResult<P>;
    if (path === "/chunks")
      return z
        .object({ hash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(raw) as ApiResult<P>;
    return revisionSchema.parse(raw) as ApiResult<P>;
  }

  private async ensureParent(path: string) {
    const parts = path.split("/");
    parts.pop();
    let dir = "";
    for (const part of parts) {
      dir = dir ? dir + "/" + part : part;
      if (!this.app.vault.getAbstractFileByPath(dir))
        await this.app.vault.createFolder(dir);
    }
  }
  private async read(path: string) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) return undefined;
    return this.app.vault.readBinary(f);
  }
  private async write(path: string, data: ArrayBuffer) {
    await this.ensureParent(path);
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) await this.app.vault.modifyBinary(f, data);
    else await this.app.vault.createBinary(path, data);
  }
  async run(manual: boolean) {
    if (this.busy) {
      if (manual) new Notice("正在同步");
      return;
    }
    if (!this.settings.enabled) {
      if (manual) new Notice("请先在仓库云同步设置中启用仓库同步");
      return;
    }
    this.busy = true;
    this.status.setText("仓库云同步 · 同步中");
    try {
      const expected = new Map<string, string>();
      const assertLocal = async (path: string) => {
        const bytes = await this.read(path);
        const current = bytes ? await hash(bytes) : undefined;
        if (current !== expected.get(path))
          throw new Error(`同步期间文件发生变化，已停止以保护内容：${path}`);
      };
      const io: SyncIO = {
        scan: async () => {
          const files: LocalFile[] = [];
          for (const f of this.app.vault.getFiles()) {
            if (!validPath(f.path)) continue;
            if (f.stat.size > MAX_FILE_SIZE)
              throw new Error(`文件超过第一版 256MB 限制：${f.path}`);
            let cached = this.hashes.get(f.path);
            if (
              !cached ||
              cached.mtime !== f.stat.mtime ||
              cached.size !== f.stat.size
            ) {
              const mtime = f.stat.mtime;
              const b = await this.app.vault.readBinary(f);
              cached = { mtime, size: b.byteLength, hash: await hash(b) };
              this.hashes.set(f.path, cached);
            }
            files.push({ path: f.path, hash: cached.hash, size: cached.size });
            expected.set(f.path, cached.hash);
          }
          return files;
        },
        manifest: async () => {
          const j = await this.api("/manifest");
          if (!Array.isArray(j.files)) throw new Error("云端清单格式错误");
          return j.files;
        },
        upload: async (path, baseRev) => {
          await assertLocal(path);
          const b = await this.read(path);
          if (!b) throw new Error("文件已移除");
          const full = await hash(b);
          const chunks: string[] = [];
          for (let i = 0; i < b.byteLength; i += CHUNK_SIZE) {
            const chunk = b.slice(i, i + CHUNK_SIZE);
            const r = await this.api("/chunks", "PUT", undefined, chunk);
            const h = await hash(chunk);
            if (r.hash !== h) throw new Error("上传块校验失败");
            chunks.push(h);
          }
          await assertLocal(path);
          return this.api("/commit", "POST", {
            path,
            baseRev,
            hash: full,
            chunks,
            size: b.byteLength,
          });
        },
        removeRemote: async (path, baseRev) => {
          await assertLocal(path);
          return this.api("/commit", "POST", {
            path,
            baseRev,
            hash: null,
            chunks: [],
            size: 0,
          });
        },
        download: async (r: Revision) => {
          if (!validPath(r.path) || r.size > MAX_FILE_SIZE)
            throw new Error("云端文件信息无效");
          await assertLocal(r.path);
          const chunks: Uint8Array[] = [];
          let total = 0;
          for (const h of r.chunks) {
            const b = await this.api(`/chunks/${h}`);
            if ((await hash(b)) !== h) throw new Error("下载块校验失败");
            total += b.byteLength;
            if (total > MAX_FILE_SIZE) throw new Error("文件超过下载限制");
            chunks.push(new Uint8Array(b));
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          if (total !== r.size || (await hash(bytes.buffer)) !== r.hash)
            throw new Error("下载文件完整性校验失败");
          await assertLocal(r.path);
          await this.write(r.path, bytes.buffer);
          if (r.hash === null) throw new Error("下载版本缺少文件哈希");
          expected.set(r.path, r.hash);
        },
        removeLocal: async (path) => {
          await assertLocal(path);
          const f = this.app.vault.getAbstractFileByPath(path);
          if (f instanceof TFile) await this.app.fileManager.trashFile(f);
          expected.delete(path);
        },
        copyLocal: async (from, to) => {
          await assertLocal(from);
          const bytes = await this.read(from);
          if (!bytes) throw new Error("原文件已移除");
          const existing = await this.read(to);
          if (existing && (await hash(existing)) !== (await hash(bytes)))
            throw new Error("冲突副本已经存在且内容不同");
          if (!existing) await this.write(to, bytes);
          expected.set(to, await hash(bytes));
        },
        save: async (state) => {
          this.settings.state = state;
          await this.save();
        },
      };
      const r = await sync(io, this.settings.state);
      this.status.setText("仓库云同步 · 已同步");
      if (manual || r.conflicts.length)
        new Notice(
          `同步完成：上传 ${r.uploaded}，下载 ${r.downloaded}，删除 ${r.deleted}${r.conflicts.length ? "；冲突已保留 " + r.conflicts.length + " 份" : ""}`,
          8000,
        );
    } catch (e) {
      const message = e instanceof Error ? e.message : "同步失败";
      this.status.setText("仓库云同步 · 需要处理");
      if (manual) new Notice(message, 10000);
      console.error("仓库云同步同步失败", message);
    } finally {
      this.busy = false;
    }
  }
  async reconnect(server: string, token: string) {
    if (this.busy) throw new Error("请等待同步结束后切换连接");
    if (server !== this.settings.server || token !== this.settings.token) {
      this.settings.enabled = false;
      this.settings.state = freshState();
      this.manifestCache = undefined;
      this.hashes.clear();
      this.settings.server = server.trim();
      this.settings.token = token.trim();
      this.settings.vault = "";
      await this.save();
    }
  }
  async deleted() {
    try {
      const { files } = await this.api("/manifest");
      const modal = new Modal(this.app);
      modal.titleEl.setText("云端回收站");
      for (const f of files.filter((f) => f.deleted)) {
        new Setting(modal.contentEl).setName(f.path).addButton((b) =>
          b.setButtonText("查看版本").onClick(() => {
            modal.close();
            new HistoryModal(this.app, this, f.path).open();
          }),
        );
      }
      if (!files.some((f: Revision) => f.deleted))
        modal.contentEl.createEl("p", { text: "没有已删除文件" });
      modal.open();
    } catch (e) {
      new Notice(String(e));
    }
  }
}
class CollectorSettings extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: CollectorPlugin,
  ) {
    super(app, plugin);
  }
  display() {
    this.render();
  }
  private render() {
    const { containerEl: c } = this;
    c.empty();
    new Setting(c).setName("仓库云同步").setHeading();
    c.createEl("p", {
      text: "首次连接前保留仓库备份。切换服务或令牌会暂停同步，重新启用后合并本地与云端内容。",
    });
    let configText = "";
    new Setting(c)
      .setName("导入设备连接配置")
      .setDesc("在服务网页为本设备生成配置后粘贴到这里。每台设备使用独立令牌。")
      .addTextArea((t) =>
        t
          .setPlaceholder('{"server":"https://…","token":"…"}')
          .onChange((v) => (configText = v)),
      )
      .addButton((b) =>
        b.setButtonText("导入").onClick(async () => {
          try {
            const raw: unknown = JSON.parse(configText);
            const config = connectionSchema.parse(raw);
            if (
              typeof config.server !== "string" ||
              typeof config.token !== "string" ||
              config.token.length < 24
            )
              throw Error("连接配置无效");
            await this.plugin.reconnect(config.server, config.token);
            const identity = await this.plugin.api("/identity");
            this.plugin.settings.vault = identity.vault;
            await this.plugin.save();
            new Notice(
              `已绑定 ${identity.name} · ${identity.vault}，请启用同步`,
            );
            this.render();
          } catch (e) {
            new Notice(String(e));
          }
        }),
      );
    let server = this.plugin.settings.server,
      token = this.plugin.settings.token;
    new Setting(c).setName("服务地址").addText((t) =>
      t
        .setPlaceholder("https://your-worker.your-account.workers.dev")
        .setValue(server)
        .onChange((v) => (server = v)),
    );
    new Setting(c).setName("设备令牌").addText((t) => {
      t.inputEl.type = "password";
      t.setValue(token).onChange((v) => (token = v));
    });
    new Setting(c).setName("保存并验证连接").addButton((b) =>
      b.setButtonText("连接").onClick(async () => {
        try {
          await this.plugin.reconnect(server, token);
          const identity = await this.plugin.api("/identity");
          this.plugin.settings.vault = identity.vault;
          await this.plugin.save();
          const r = await this.plugin.api("/manifest");
          new Notice(
            `连接成功：${identity.name} · ${identity.vault}，云端 ${r.files.filter((f: Revision) => !f.deleted).length} 个文件`,
          );
          this.render();
        } catch (e) {
          new Notice(String(e));
        }
      }),
    );
    c.createEl("p", {
      text: this.plugin.settings.vault
        ? "云端仓库：" + this.plugin.settings.vault
        : "尚未验证连接",
    });
    new Setting(c)
      .setName("启用仓库双向同步")
      .setDesc("本地修改和删除将传播到其他设备。请勿同时启用其他仓库同步工具。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.enabled).onChange(async (v) => {
          this.plugin.settings.enabled = v;
          await this.plugin.save();
          if (v) void this.plugin.run(true);
        }),
      );
    new Setting(c)
      .setName("同步间隔（秒）")
      .setDesc("至少 30 秒；手机需保持 Obsidian 活跃。")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.interval))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 30) {
              this.plugin.settings.interval = n;
              await this.plugin.save();
              this.plugin.schedule();
            }
          }),
      );
    new Setting(c)
      .setName("立即同步")
      .addButton((b) =>
        b.setButtonText("同步").onClick(() => void this.plugin.run(true)),
      );
  }
}
class HistoryModal extends Modal {
  constructor(
    app: App,
    private plugin: CollectorPlugin,
    private path: string,
  ) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText("文件历史：" + this.path);
    void this.load();
  }
  async load() {
    try {
      const { files } = await this.plugin.api(
        `/history?path=${encodeURIComponent(this.path)}`,
      );
      if (!files.length) {
        this.contentEl.createEl("p", { text: "暂无历史版本" });
        return;
      }
      for (const r of files) {
        new Setting(this.contentEl)
          .setName(
            `${r.deleted ? "已删除" : r.size + " 字节"} · ${new Date(r.updatedAt).toLocaleString()}`,
          )
          .setDesc(`版本 ${r.rev}`)
          .addButton((b) =>
            b.setButtonText("恢复此版本").onClick(async () => {
              try {
                const current = (
                  await this.plugin.api(
                    `/history?path=${encodeURIComponent(this.path)}`,
                  )
                ).files[0];
                await this.plugin.api("/restore", "POST", {
                  path: this.path,
                  rev: r.rev,
                  baseRev: current.rev,
                });
                new Notice(
                  "云端版本已恢复，请同步；未上传的本地修改会按冲突保留",
                );
                this.close();
              } catch (e) {
                new Notice(String(e));
              }
            }),
          );
      }
    } catch (e) {
      this.contentEl.createEl("p", { text: String(e) });
    }
  }
  onClose() {
    this.contentEl.empty();
  }
}
