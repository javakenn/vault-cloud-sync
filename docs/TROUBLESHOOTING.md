# Setup and sync troubleshooting

[中文排查步骤](README.zh-CN.md#8-常见问题) · [Installation](INSTALL.md)

| Symptom | What to check |
| --- | --- |
| `node`, `npm` or `git` is not found | Install Node.js 22+ and Git, reopen Terminal/PowerShell and check the three version commands in README. Run npm commands from the cloned project folder containing `package.json`. |
| R2 activation / `10042` | Activate R2 in your own Cloudflare dashboard, then rerun `npm run setup:cloudflare` in the same project. Activation/payment confirmation is performed by you, not by the plugin. |
| Browser localhost OAuth callback refuses connection | The Wrangler login listener may have timed out. Run `npx wrangler login`, finish the newly opened authorization promptly and return to the terminal, then rerun setup. Refreshing an old callback URL does not restart login. |
| Existing D1 name or resource identity mismatch | Do not delete or adopt an unknown database. Check [partial-provisioning recovery](SELF-HOSTING.md#retry-and-recovery). A new deployment can use a new project name from a fresh clone; an initialized directory cannot be switched to another account/project. |
| Cannot see `.data` or `.obsidian` | These folders are hidden. Show hidden files or open their full relative path. `.data` lives in the cloned project; `.obsidian` lives in the local note vault. They are not the same folder. iOS has additional limitations described in INSTALL.md. |
| Plugin not shown in Community search | Directory review may still be pending. Use the release/manual installation steps. Installing the GitHub source ZIP is not the same as installing the three plugin assets. |
| Plugin does not appear in installed plugins | Check `<config folder>/plugins/ob-collector/main.js`, `manifest.json`, `styles.css`. Avoid a nested extra `ob-collector` directory or `.txt` suffix. Enable community plugins and restart that vault. |
| Cannot log in to management page | Open `.data/admin-secret.json` as text and copy **only the `ADMIN_TOKEN` value**, not the full JSON. Use the actual service URL from setup, not a README example. |
| Plugin rejects JSON / device token | Import the complete JSON from `mac.json`, `iphone.json` or `android.json` for the intended device. Never use the administrator secret. The server URL and token must come from the same deployment. |
| Device returns 401 after working earlier | Its token may have been revoked. Create a new device through the management page and import its configuration. Do not rerun setup expecting a revoked saved token to be silently replaced. |
| Connection works but nothing syncs | Turn on **启用仓库双向同步**, click **同步** under **立即同步**, keep Obsidian open and wait for the first upload to finish. Phones have no guaranteed background execution. Hidden files/settings are intentionally excluded. |
| Two local vaults unexpectedly merge | They use the same cloud vault ID. Stop sync on the unintended installation, back up both vaults and create separate cloud IDs/device configurations. Do not delete cloud files while trying to separate active copies, because deletions propagate. |
| File is too large / sync needs attention | Use a small note/image first. Review the exact notice and [capacity limits](SELF-HOSTING.md#capacity-and-availability). The protocol maximum does not guarantee every phone or free Worker tier can handle that file. |
| `.workers.dev` URL cannot be reached | Check it from both computer and phone. Retry on a network that can reach your service; review Cloudflare deployment/health. A reachable personal domain may be needed on some networks; this project does not buy one for you. |

For help, include OS/Obsidian/plugin versions, whether installation was via release files or a generated vault ZIP, the failing step and error message. Redact administrator/device tokens, private JSONs and note contents. If the service URL itself identifies private infrastructure, redact it too. Never upload `.data` or a private device ZIP.
