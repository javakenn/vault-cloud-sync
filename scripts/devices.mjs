import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { load, prepareDevice } from "./setup-lib.mjs";
const { values } = parseArgs({
  options: {
    vault: { type: "string", default: "notes" },
    platform: { type: "string", default: "mac" },
    name: { type: "string", default: "My device" },
  },
});
try {
  const state = await load(".data/setup-state.json");
  if (!state?.server) throw Error("请先运行 npm run setup:cloudflare");
  const result = await prepareDevice({
    root: resolve("."),
    state,
    vault: values.vault,
    platform: values.platform,
    name: values.name,
  });
  console.log("设备配置：" + result.file + "\n私密仓库包：" + result.zipPath);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
