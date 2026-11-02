import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { zipFiles } from "./zip.mjs";
export const validName = (s) => /^[a-z][a-z0-9-]{2,47}$/.test(s);
export const validVault = (s) => /^[A-Za-z0-9_-]{1,80}$/.test(s);
export async function savePrivate(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
}
export async function load(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return undefined;
    throw e;
  }
}
export function command(root, args, interactive = false) {
  const r = spawnSync(
    process.execPath,
    [join(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
    {
      cwd: root,
      encoding: "utf8",
      stdio: interactive ? "inherit" : "pipe",
      env: { ...process.env, ...(interactive ? {} : { CI: "1" }) },
      maxBuffer: 8 * 1024 ** 2,
    },
  );
  if (r.status !== 0) {
    const output = r.stderr || r.stdout || "";
    if (/enable R2|10042/i.test(output))
      throw Error(
        "请先在 Cloudflare 控制台开通 R2，再重新运行向导。不会自动购买套餐。",
      );
    throw Error(
      "Wrangler 操作失败：" +
        args.slice(0, 3).join(" ") +
        "。已有进度保存在 .data；请确认网络和登录状态后重试。",
    );
  }
  return r.stdout || "";
}
export async function provision({
  root,
  accountId,
  name,
  region = "apac",
  run = command,
  request = fetch,
  log = console.log,
}) {
  if (!/^[a-f0-9]{32}$/.test(accountId) || !validName(name))
    throw Error("账号 ID 或项目名格式无效");
  if (!["apac", "weur", "eeur", "enam", "wnam", "oc"].includes(region))
    throw Error("区域无效");
  const data = join(root, ".data");
  await mkdir(data, { recursive: true, mode: 0o700 });
  await chmod(data, 0o700);
  const statePath = join(data, "setup-state.json");
  const previous = await load(statePath);
  if (previous && (previous.accountId !== accountId || previous.name !== name))
    throw Error("此目录已绑定其他项目；请使用新的项目副本，避免覆盖已有部署。");
  const state = previous || { accountId, name, region };
  await savePrivate(statePath, state);
  const config = JSON.parse(
    await readFile(join(root, "wrangler.jsonc"), "utf8"),
  );
  config.account_id = accountId;
  config.name = name;
  config.d1_databases[0].database_name = name;
  config.r2_buckets[0].bucket_name = name + "-files";
  const cfg = join(root, "wrangler.local.jsonc");
  await savePrivate(cfg, config);
  const cloud = (args) => run(root, [...args, "--config", cfg]);
  const list = () => JSON.parse(cloud(["d1", "list", "--json"]));
  let database = list().find((d) => d.name === name);
  if (database && !state.databaseCreated)
    throw Error("发现同名现有 D1，拒绝接管。请换一个新的项目名。");
  if (!database) {
    if (state.databaseCreated)
      throw Error(
        "已登记的数据库不存在；请检查 Cloudflare 账号和资源，避免意外重建。",
      );
    cloud([
      "d1",
      "create",
      name,
      "--location",
      region,
      "--update-config=false",
    ]);
    state.databaseCreated = true;
    await savePrivate(statePath, state);
    database = list().find((d) => d.name === name);
  }
  if (
    !database?.uuid ||
    (state.databaseId && state.databaseId !== database.uuid)
  )
    throw Error("D1 资源身份不匹配，已停止");
  state.databaseId = database.uuid;
  await savePrivate(statePath, state);
  config.d1_databases[0].database_id = database.uuid;
  if (!state.bucketCreated) {
    cloud([
      "r2",
      "bucket",
      "create",
      name + "-files",
      "--location",
      region,
      "--update-config=false",
    ]);
    state.bucketCreated = true;
    await savePrivate(statePath, state);
  }
  await savePrivate(cfg, config);
  const secretPath = join(data, "admin-secret.json");
  const secret = (await load(secretPath)) || {
    ADMIN_TOKEN: randomBytes(36).toString("base64url"),
  };
  await savePrivate(secretPath, secret);
  run(root, ["d1", "migrations", "apply", "DB", "--remote", "--config", cfg]);
  const output = run(root, ["deploy", "--config", cfg]);
  const server = output.match(
    /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/,
  )?.[0];
  if (!server || new URL(server).hostname.split(".")[0] !== name)
    throw Error(
      "没有获得预期 Worker 地址；检查 workers.dev 子域是否启用。资源已保留，不会删除。",
    );
  run(root, ["secret", "bulk", secretPath, "--config", cfg]);
  const health = await request(server + "/api/health");
  if (!health.ok)
    throw Error(
      "部署完成但健康检查未通过；请稍后重试向导，已有资源和密钥会保留。",
    );
  const body = await health.json();
  if (body.provider !== "cloudflare" || body.readOnly)
    throw Error("目标不是可写的 Cloudflare 同步服务");
  state.server = server;
  await savePrivate(statePath, state);
  log(
    "Cloudflare 已就绪：" +
      server +
      "；管理员密钥保存于 .data/admin-secret.json，不会打印。",
  );
  return state;
}
export async function prepareDevice({
  root,
  state,
  vault,
  platform,
  name,
  request = fetch,
}) {
  if (
    !validVault(vault) ||
    !["mac", "iphone", "android"].includes(platform) ||
    !name ||
    name.length > 80
  )
    throw Error("仓库或设备参数无效");
  const dir = join(root, ".data", "devices", vault);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, platform + ".json");
  let device = await load(file);
  if (device && (device.server !== state.server || device.vault !== vault))
    throw Error("已有设备配置与目标不一致，拒绝覆盖");
  if (device) {
    const r = await request(state.server + "/api/identity", {
      headers: { authorization: "Bearer " + device.token },
    });
    if (!r.ok)
      throw Error(
        "已保存设备凭据失效；请在服务管理网页撤销或创建新设备，勿盲目覆盖原配置。",
      );
  } else {
    const secret = await load(join(root, ".data/admin-secret.json"));
    const r = await request(state.server + "/api/admin/devices", {
      method: "POST",
      headers: {
        authorization: "Bearer " + secret.ADMIN_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ vault, name }),
    });
    if (!r.ok) throw Error("设备创建失败 " + r.status);
    device = { server: state.server, ...(await r.json()) };
    await savePrivate(file, device);
  }
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  const base = ".obsidian/plugins/" + manifest.id + "/";
  const files = [];
  for (const name of ["main.js", "manifest.json", "styles.css"])
    files.push([base + name, await readFile(join(root, name))]);
  files.push([
    base + "data.json",
    Buffer.from(
      JSON.stringify({
        server: state.server,
        token: device.token,
        vault,
        enabled: false,
        interval: 60,
        state: { schema: 1, files: {} },
      }),
    ),
  ]);
  files.push([
    ".obsidian/community-plugins.json",
    Buffer.from(JSON.stringify([manifest.id])),
  ]);
  files.push([
    "Start here.md",
    Buffer.from(
      "Enable Vault Cloud Sync in Community plugins, verify the connection, then enable sync. Sync your first device completely before connecting the next. Keep mobile Obsidian open while syncing.\n",
    ),
  ]);
  const zip = zipFiles(
    files.map(([path, data]) => ["Cloud Notes/" + path, data]),
  );
  const zipPath = join(dir, platform + "-vault.zip");
  await writeFile(zipPath, zip, { mode: 0o600 });
  await chmod(zipPath, 0o600);
  return { file, zipPath };
}
