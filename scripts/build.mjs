import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { zipFiles } from "./zip.mjs";
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
await build({
  entryPoints: ["plugin/src/main.ts"],
  outfile: "main.js",
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: "es2020",
  external: ["obsidian"],
  minify: true,
  banner: {
    js:
      "/*! Includes Zod, distributed under the following license:\n" +
      (await readFile("node_modules/zod/LICENSE", "utf8")) +
      "\n*/",
  },
  logLevel: "info",
});
await copyFile("plugin/styles.css", "styles.css");
const dir = "dist/" + manifest.id;
await mkdir(dir, { recursive: true });
const files = [];
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(f, dir + "/" + f);
  files.push([manifest.id + "/" + f, await readFile(f)]);
}
await mkdir("public", { recursive: true });
const zip = zipFiles(files);
await writeFile("public/" + manifest.id + "-" + manifest.version + ".zip", zip);
await writeFile("dist/" + manifest.id + "-" + manifest.version + ".zip", zip);
