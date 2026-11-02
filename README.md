# Vault Cloud Sync

Sync an Obsidian vault across desktop, iPhone and Android using **your own Cloudflare account**. The repository contains both the plugin and the Workers + D1 + private R2 backend. No developer-hosted service or developer credentials are required.

[中文使用指南](docs/README.zh-CN.md) · [Privacy](PRIVACY.md) · [Self-hosting](docs/SELF-HOSTING.md)

## What it does

- Two-way synchronization of notes and ordinary attachments, including files saved by other plugins.
- SHA-256 integrity checks and 1 MiB content-addressed chunks.
- Conflict copies for concurrent edits; deletion propagation, file history and restore.
- Independent, revocable device tokens and separate cloud vaults.
- Authenticated ETags to avoid downloading unchanged manifests.
- A setup wizard that creates your Cloudflare resources and generates private device installation packages.

This is a community project, not the official Obsidian Sync service. The plugin interface is currently Chinese. On 2026-11-02 the Community directory entry was published and its automated review was in progress; approval and in-app installation are not yet confirmed. Use the manual instructions below if the plugin cannot be installed through Community plugins.

## Start here: first device, then the others

You need a computer for the initial Cloudflare deployment. Phones only need Obsidian and their own device package/configuration; you do not install Node.js or deploy another backend on each phone.

| What you want to do | Start here |
| --- | --- |
| Deploy with your own Cloudflare account | Steps 1–2 below |
| Create a local Obsidian vault and add the plugin | [Installation walkthrough](docs/INSTALL.md) |
| Add the plugin to an existing vault | [Existing vault instructions](docs/INSTALL.md#existing-vault) |
| Connect iPhone or Android | [Mobile installation](docs/INSTALL.md#iphone-and-ipad) |
| Create a separate cloud vault or another device | [Device and vault management](#manage-devices-and-additional-vaults) |
| Build the plugin yourself | [Build from source](docs/INSTALL.md#build-the-plugin-from-source) |
| Read the full Chinese walkthrough | [中文：从零开始使用](docs/README.zh-CN.md) |

### 1. Prepare the computer and Cloudflare

1. Install [Obsidian](https://obsidian.md/download), [Node.js 22+](https://nodejs.org/en/download) and [Git](https://git-scm.com/downloads) on your computer. Use Terminal on macOS/Linux or PowerShell on Windows. Run `node --version`, `npm --version` and `git --version` to confirm all three commands work.
2. Sign in to your own [Cloudflare dashboard](https://dash.cloudflare.com/). Open **R2 Object Storage** and complete initial activation. The dashboard may request a payment method and billing agreement; review the current terms yourself. The wizard does not buy a paid Workers plan or domain.
3. Back up your existing notes. Keep the vault you will synchronize outside folders managed by iCloud, OneDrive, Dropbox or another sync engine. On a Mac, a local `Vaults` folder in your home directory is one option; Documents/Desktop may themselves be in iCloud.

### 2. Create your backend and device packages

Run these commands in order, **once on the computer**:

```sh
git clone https://github.com/javakenn/vault-cloud-sync.git
cd vault-cloud-sync
npm ci
npm run setup:cloudflare
```

At the prompts:

1. Complete Cloudflare authorization in the browser opened by Wrangler. Return to the terminal afterward. If it times out, run `npx wrangler login`, complete the new authorization promptly, then rerun the setup command; do not keep refreshing an old localhost callback URL.
2. Select your own account if several are available.
3. Enter a new project name, for example `my-vault-sync`. Use 3–48 lowercase letters, digits or hyphens, starting with a letter. This is an infrastructure name, not your local vault name. The default cloud vault ID is `notes`.
4. Wait for a service URL and three device-package paths. The wizard creates a Worker, D1 database and private R2 bucket, applies migrations, provisions a private administrator secret, verifies the service and creates independent Mac/iPhone/Android tokens. It does not upload your existing notes at this stage.

A successful run prints a service URL in this form (example only):

```text
https://my-vault-sync.your-account.workers.dev
```

Open your actual URL in a browser; it is your device-management page. Your service URL and tokens are already included in the generated device JSONs. No author resources or credentials are needed.

All generated files are in the **project folder you just cloned**. `.data` is hidden on many systems; macOS Finder uses `Command+Shift+.` to show hidden files, while Windows Explorer uses **View → Show → Hidden items**. You can also navigate directly to these paths in your file manager:

| File, relative to the project folder | What to do with it |
| --- | --- |
| `.data/devices/notes/mac-vault.zip` | Start with a new, preconfigured desktop vault |
| `.data/devices/notes/mac.json` | Connect an existing desktop vault |
| `.data/devices/notes/iphone-vault.zip` / `iphone.json` | Transfer privately to the iPhone only |
| `.data/devices/notes/android-vault.zip` / `android.json` | Transfer privately to the Android only |
| `.data/admin-secret.json` | Administrator credential for the management page; use only its `ADMIN_TOKEN` value |
| `.data/setup-state.json` | Setup progress and service URL; keep privately |
| `wrangler.local.jsonc` | Your saved Cloudflare bindings; keep privately |

Do not copy the administrator JSON into the plugin. Device JSONs and vault ZIPs contain device credentials: never publish them, attach them to issues or upload them as releases. Back up `.data` privately. Rerun the same setup command after a transient failure; see [partial-provisioning recovery](docs/SELF-HOSTING.md#retry-and-recovery) if an existing-resource conflict remains.

### 3. Create a local vault and add the plugin

**Try a new vault first:** unzip `mac-vault.zip` into a local folder outside any other sync service. It contains `Cloud Notes`, including a hidden configuration folder. In Obsidian, choose **Open folder as vault**, then select `Cloud Notes` itself. Trust the vault you generated, enable **Vault Cloud Sync** under **Settings → Community plugins**, open its settings, click **连接** under **保存并验证连接**, then enable **启用仓库双向同步** and click **同步** under **立即同步**.

The package already includes the plugin and this device's connection. This is a new empty vault, not a copy of your existing notes.

**Use an existing vault:** install the three plugin files into that vault and import `mac.json`. See the [exact folder layout, download links and button sequence](docs/INSTALL.md#existing-vault). Obsidian installs plugins **per vault**; installing in another vault does not install it here. Do not copy another vault's `data.json` or sync baseline.

### 4. Confirm the first sync before connecting a phone

1. On the computer, create `Sync test.md` with a few lines and add a small image. Run **立即同步**. The plugin should report **仓库云同步 · 已同步**.
2. After the first device's upload finishes, connect the phone using its own `iphone-vault.zip`/`iphone.json` or `android-vault.zip`/`android.json`. Follow [mobile steps](docs/INSTALL.md#iphone-and-ipad), preserving hidden configuration files.
3. Keep Obsidian open on the phone, run sync and confirm the note and image appear. Edit one line on the phone, sync, then sync the computer and confirm the edit arrives.
4. Only after this disposable test succeeds, connect a backed-up real vault. The first connection merges local and remote files; it is not a one-way overwrite. All devices for the same notes must use the same cloud vault ID and different device tokens.

Physical mobile installation remains to be verified on your device. If iOS does not recognize a copied local vault, use the supported installation alternatives in the [installation guide](docs/INSTALL.md#iphone-and-ipad) instead of overwriting an existing vault.

## Manage devices and additional vaults

Open the service URL printed by the wizard. Open `.data/admin-secret.json` in a text editor and copy **only the value of `ADMIN_TOKEN`**, without the JSON braces, key name or quotes. Paste it into **管理员令牌**, leave **云端仓库 ID** as `notes` (or your chosen ID), and click **连接管理**. Enter a device name and click **生成设备配置**; copy the complete resulting device JSON into that device's plugin settings. The ID may be new: the first device creation registers its access, and the first file commit creates the vault's version record. No manual database editing is needed. The management page keeps credentials only in page memory; use its sign-out button afterward. Copy only a device configuration to Obsidian.

To create another isolated cloud vault with its own device packages:

```sh
npm run devices -- --vault work --platform mac --name "Work Mac"
npm run devices -- --vault work --platform iphone --name "Work iPhone"
```

A local vault is an Obsidian folder; a cloud vault ID is its server-side namespace; a device token identifies one installation. Giving two independent local vaults the same cloud ID merges their files. To keep a second vault isolated, create it with a different ID and import its newly generated configuration.

The CLI reserves one saved configuration per vault/platform. For more devices of the same platform, create distinct device tokens through the management webpage. Revoking a device stops future access; it cannot erase files already downloaded to that device.

## Problems during setup or sync

See [Troubleshooting](docs/TROUBLESHOOTING.md) for missing commands, R2 activation, authorization callback errors, hidden files, connection failures, revoked tokens and phones not syncing. When requesting help, include the failing step and error text; remove tokens and private note contents.

## Data and limitations

The plugin uploads allowed vault-relative paths and file contents to **your configured server**, and stores a local device token and sync baseline in its Obsidian plugin settings. It makes no requests until you configure a service and verify or enable sync. It has no client analytics, ads, automatic code downloading, or self-updater. See [PRIVACY.md](PRIVACY.md).

- HTTPS in transit; **no end-to-end encryption**. The Cloudflare account owner and backend administrator can access data.
- Hidden files/directories, including the Obsidian config directory, are excluded. Settings/themes/plugins and empty folders are not synchronized.
- Mobile background execution is limited by the operating system; open Obsidian to synchronize.
- Single-file protocol limit: 256 MiB. The plugin buffers an entire file in memory. Mobile memory, Worker CPU/subrequest quotas, and network conditions can impose lower practical limits. A 5 GB first upload has not been validated.
- Logical history quota: 10 GiB per cloud vault, including all revisions. No automatic history pruning or orphaned-object garbage collection.
- Sync propagates deletions and is not a backup. File history is in the same Cloudflare account; export independent backups before migrating or deleting infrastructure.
- Conflict copies preserve edits for manual merging. Renames propagate as a new file plus a tombstone for the old name.

## Develop and update

```sh
npm ci
npm run check
npm run lint
npm test
npm run build
npm run dev
# After initial setup, redeploy only your own saved bindings:
npm run deploy
```

Tests cover the sync engine, the packaged plugin, and real local Cloudflare workerd/D1/R2 behavior. Local tests do not prove physical device compatibility or production capacity. `npm run dev` uses local simulated bindings and a local development secret you provide through `.dev.vars`; see the self-hosting guide.

Built release files contain no account IDs or device tokens. GitHub Release tag and root `manifest.json` version must match. See [release checklist](docs/RELEASING.md).

## License

MIT © 2026 Kai. See [LICENSE](LICENSE). Cloudflare and Obsidian are separate services with their own terms. Dependencies retain their own licenses.
