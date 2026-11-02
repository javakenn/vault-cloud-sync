# Create a vault, add the plugin and connect devices

[中文完整步骤](README.zh-CN.md) · [Deploy your backend first](../README.md#2-create-your-backend-and-device-packages)

The backend is deployed once. Install the plugin separately in each **local Obsidian vault** and give every installation a different device token. A GitHub account/repository used to download this project is not your cloud vault.

## Choose an installation route

| Situation | Use |
| --- | --- |
| New disposable desktop vault | The generated `mac-vault.zip` (plugin and connection already included) |
| Existing desktop vault | Three plugin release files + `mac.json` |
| iPhone/Android while marketplace approval is pending | Its generated device vault ZIP; platform limitations below |
| Community installation is available for your account | Install **Vault Cloud Sync** in each local vault, then import that device's JSON |
| Build rather than download | [Build from source](#build-the-plugin-from-source) |

The Community entry was published on 2026-11-02 with automated review in progress. This is not confirmation of approval. If search/install is unavailable, use manual installation. Installing from Community plugins still does not deploy the backend or supply a device token.

## New desktop vault

1. Complete `npm run setup:cloudflare` on the computer. Find `.data/devices/notes/mac-vault.zip` inside the cloned project directory.
2. Unzip into a local folder outside iCloud/OneDrive/Dropbox. The resulting folder is **Cloud Notes**. Copy the whole folder, including hidden `.obsidian`; do not copy just `Start here.md`.
3. In Obsidian's vault switcher, choose **Open folder as vault** and select **Cloud Notes**, not the ZIP or its parent folder. Opening this generated folder creates the local vault entry; no separate “create plugin” action is needed.
4. Trust this vault you generated and enable community plugins if prompted. In **Settings → Community plugins**, enable **Vault Cloud Sync**. Its plugin folder ID is `ob-collector`.
5. Open that plugin's settings. Under **保存并验证连接**, click **连接**. The connection is already filled in. Expect **连接成功** with the device name, cloud vault ID and file count.
6. Turn on **启用仓库双向同步**. Under **立即同步**, click **同步**. Expect **仓库云同步 · 已同步**. Automatic sync initially starts disabled; after enabling it, the default interval is 60 seconds.
7. Create a test note and attach a small image. Sync completely before connecting the next device.

## Existing vault

First keep an independent backup, including the existing hidden config folder. If the vault lives in a folder managed by another sync tool, close Obsidian on the devices, copy the complete vault to a local non-synced folder, then open the local copy. Keep the original backup and use only the new active copy.

### A. Download the plugin files

Download these **three individual attachments** from the same [GitHub Release](https://github.com/javakenn/vault-cloud-sync/releases/tag/0.3.0):

- [main.js](https://github.com/javakenn/vault-cloud-sync/releases/download/0.3.0/main.js)
- [manifest.json](https://github.com/javakenn/vault-cloud-sync/releases/download/0.3.0/manifest.json)
- [styles.css](https://github.com/javakenn/vault-cloud-sync/releases/download/0.3.0/styles.css)

The automatically generated **Source code ZIP** is source, not the three-file install package. Your generated `mac-vault.zip` is a complete empty vault with private credentials; do not unpack it over a real vault to install just the plugin.

### B. Create the plugin folder and add the files

Close this vault in Obsidian. Open its folder in the file manager and create `plugins/ob-collector/` **inside its configuration folder**. Default layout:

```text
Your existing vault/
├── your notes and attachments
└── .obsidian/
    └── plugins/
        └── ob-collector/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

On macOS Finder, `Command+Shift+.` shows hidden files. On Windows Explorer, enable **View → Show → Hidden items**; ensure the downloads did not acquire an extra `.txt` extension. With a custom Obsidian config folder, use that folder instead of `.obsidian`.

Create only the missing plugin directory. Preserve other plugins and settings. Avoid a double nested `ob-collector/ob-collector/` folder. Do not copy `data.json` from a different vault: it contains that installation's token and sync baseline.

If the plugin is already installed in this exact vault, skip folder creation. For an update in the same vault, replace only the three plugin files and preserve its own `data.json`.

### C. Enable and bind the plugin

1. Reopen the vault, go to **Settings → Community plugins**, enable community plugins if needed, then enable **Vault Cloud Sync**. If it is absent, check the layout above and restart Obsidian.
2. In a text editor, open **this device's** `.data/devices/notes/mac.json` from the setup project. Copy the entire JSON, including `{` and `}`.
3. Open the plugin settings, paste into **导入设备连接配置** and click **导入**. Expect **已绑定** with the device name/cloud ID. It saves the connection, not the notes.
4. Click **连接** under **保存并验证连接** if you want to verify the visible values. Do not paste `.data/admin-secret.json` here.
5. Turn on **启用仓库双向同步**, then click **同步** under **立即同步**. Wait for **已同步** before introducing another device.

The first sync merges existing local and remote files. It does not erase the cloud and replace it wholesale. Same-path differing content can create conflict copies. Two independent local vaults should use separate cloud vault IDs; otherwise their notes will merge.

## iPhone and iPad

Do not deploy another backend on the phone. Use the **same service and cloud vault ID** as the computer, but `iphone.json` or `iphone-vault.zip` with a different token. Keep the phone app open for sync.

### When Community installation is available

1. In mobile Obsidian, create a new local vault; turn **Save in iCloud Drive** off.
2. Under **Settings → Community plugins → Browse**, search **Vault Cloud Sync**. If it can be installed, install and enable it.
3. Transfer `iphone.json` privately to the device. Open it as text, copy the complete JSON and import using **导入设备连接配置 → 导入**.
4. Verify **连接**, enable **启用仓库双向同步**, run **同步** and wait for the computer's test note/image. Edit on the phone, sync, then sync the computer to confirm both directions.

This route depends on directory approval and availability. If the plugin is not installable, do not assume the backend has failed.

### Manual route while review is pending

1. In iPhone Obsidian, create a temporary local vault with iCloud storage off, establishing **Files → On My iPhone → Obsidian**.
2. Privately transfer `iphone-vault.zip` to the phone. Unzip it in Files, obtaining the complete **Cloud Notes** directory. Preserve its hidden `.obsidian` directory.
3. Force quit Obsidian. Copy the **whole new folder**, not only visible notes, into **On My iPhone → Obsidian**. Never overwrite an existing vault or a same-name folder.
4. Reopen Obsidian and select the copied vault if it is recognized. Enable the plugin, verify its prefilled connection and enable sync as above.

**iOS limitation:** normal Files UI does not provide general access to `.obsidian`, and copied vault recognition can vary. This manual ZIP flow has not been verified on a physical iPhone in this release. If it is not recognized, stop rather than replacing real notes. One alternative is to prepare a *disposable* iCloud vault with the plugin from a computer, keep this plugin's sync disabled there, then use Obsidian's documented move to **On My iPhone/Device → Obsidian** before enabling it. This is installation staging, not a recommendation to run two sync engines on the same vault. See [Obsidian config-folder guidance](https://obsidian.md/help/configuration-folder) and [local-vault migration guidance](https://obsidian.md/help/sync/switch).

## Android

1. Privately transfer `android-vault.zip` from the setup project to the phone.
2. Unzip to a local Documents folder. In the file manager, enable **Show hidden files** and confirm **Cloud Notes/.obsidian/plugins/ob-collector/** contains the plugin files.
3. In Obsidian, choose **Open folder as vault**, select **Cloud Notes**, and grant access to the directory. Do not select the ZIP or its parent folder.
4. Enable **Vault Cloud Sync** under Community plugins, verify the prefilled connection, enable two-way sync and click sync.
5. Wait for the computer's test note/image. Make a small phone edit and confirm it arrives at the computer after both synchronize.

If installing through an approved Community listing instead, create/open a local vault, install the plugin there, and import the full `android.json`. Physical Android installation remains to be verified on your device.

## Daily use and updates

- Sync only runs when enabled; on phones, keep Obsidian open. Use **立即同步** for a manual attempt.
- The command palette offers **立即同步**, **查看当前笔记历史 / 恢复** and **查看云端回收站**. Conflicts are preserved for manual merging; deletion propagates to other devices.
- Plugin settings and hidden files are not synchronized. Each vault needs its own plugin installation and device binding.
- Updates: use Community updates once available, or replace the same three release files in the same vault while preserving **its own** `data.json`. Backend updates are separate; see [operations](SELF-HOSTING.md#deploy-updates).

## Build the plugin from source

If you prefer to build rather than download, use the cloned project directory:

```sh
npm ci
npm run build
```

This creates `main.js`, `manifest.json` (already in the root), `styles.css`, an install folder at `dist/ob-collector/`, and `dist/ob-collector-0.3.0.zip`. Copy the **contents** of `dist/ob-collector/` to your local vault's `plugins/ob-collector/` folder, or unzip that public plugin ZIP to get the plugin folder. This builds plugin code only; it does not create Cloudflare infrastructure, upload your notes, or configure a device token.

`npm run setup:cloudflare` runs the build automatically and additionally deploys the backend and generates **private** device vault ZIPs under `.data`. Do not confuse a public plugin ZIP with a private device ZIP.
