import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { command, load, provision, prepareDevice } from "./setup-lib.mjs";
const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "account-id": { type: "string" },
    region: { type: "string", default: "apac" },
    vault: { type: "string", default: "notes" },
    "non-interactive": { type: "boolean", default: false },
  },
});
const root = resolve(".");
const rl = values["non-interactive"]
  ? undefined
  : createInterface({ input: process.stdin, output: process.stdout });
try {
  let auth = JSON.parse(command(root, ["whoami", "--json"]));
  if (!auth.loggedIn) {
    if (!rl) throw Error("请先运行 npx wrangler login");
    command(root, ["login"], true);
    auth = JSON.parse(command(root, ["whoami", "--json"]));
  }
  const prior = await load(".data/setup-state.json");
  let accountId = values["account-id"] || prior?.accountId;
  if (!accountId && auth.accounts.length === 1) accountId = auth.accounts[0].id;
  if (!accountId) {
    console.log(auth.accounts.map((a) => a.name + " : " + a.id).join("\n"));
    if (!rl) throw Error("多个 Cloudflare 账号，请指定 --account-id");
    accountId = (await rl.question("Cloudflare account ID: ")).trim();
  }
  if (!auth.accounts.some((a) => a.id === accountId))
    throw Error("当前授权不能访问所选账号");
  let name = values.name || prior?.name;
  if (!name) {
    if (!rl) throw Error("请指定 --name，例如 vault-cloud-sync-personal");
    name =
      (await rl.question("New project name [vault-cloud-sync]: ")).trim() ||
      "vault-cloud-sync";
  }
  console.log(
    "将创建/更新你自己账号下的 Worker、D1 和私有 R2。R2 首次开通需在控制台完成；不会自动购买付费套餐。仓库内容会上传至该账号。\n",
  );
  const state = await provision({
    root,
    accountId,
    name,
    region: values.region,
  });
  for (const [platform, label] of [
    ["mac", "My Mac"],
    ["iphone", "My iPhone"],
    ["android", "My Android"],
  ]) {
    const out = await prepareDevice({
      root,
      state,
      vault: values.vault,
      platform,
      name: label,
    });
    console.log(platform + ": " + out.zipPath + " / " + out.file);
  }
  console.log(
    "完成。按 README 安装，先同步电脑，再接入手机。上述文件包含设备凭据，请勿公开分享。",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl?.close();
}
