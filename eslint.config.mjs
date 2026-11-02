import obsidianmd from "eslint-plugin-obsidianmd";
export default [
  { ignores: ["node_modules/**", ".data/**", ".wrangler/**", "dist/**", "main.js", "backend/**", "cloudflare/**", "tests/**", "scripts/**"] },
  ...obsidianmd.configs.recommended,
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ["eslint.config.mjs"] } } } },
];
