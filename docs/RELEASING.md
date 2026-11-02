# Releasing and Community directory submission

1. Review device evidence before making compatibility claims. Physical iOS/Android installation and sync should be verified with a disposable vault before recommending a broad rollout. A preview release must disclose untested devices; automated tests do not replace these checks.
2. Run `npm ci`, `npm run check`, `npm run lint`, `npm test`, and `npm run audit:release`.
3. Update root `manifest.json`, `package.json` and `versions.json` together. Build with `npm run build`. Review `main.js` and ensure no private config is bundled.
4. Create a GitHub Release with a tag exactly matching the manifest version (no added `v`). Upload `main.js`, `manifest.json`, and `styles.css` as individual assets. Never upload `.data`, `wrangler.local.jsonc`, `.dev.vars`, private JSONs or device vault ZIPs.
5. Sign in at https://community.obsidian.md with the owner's Obsidian account and link the matching GitHub account. Submit this repository using the directory's Plugins → New plugin form, then address scanner and reviewer feedback.

A GitHub Release does not imply Community directory approval. Until listed, users install manually. The maintainer must perform the account-linking/submission step if it cannot be completed through an authorized session. Do not claim marketplace availability based on a local build, draft release, or submitted form alone.

Suggested submission: name `Vault Cloud Sync`, ID `ob-collector`, description from `manifest.json`, repository `javakenn/vault-cloud-sync`. No author-hosted account is required; users deploy and pay for their own Cloudflare resources. The project is MIT licensed and documents all network use in README and PRIVACY.md.
