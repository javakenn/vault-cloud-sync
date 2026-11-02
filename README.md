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

This is a community project, not the official Obsidian Sync service. The initial plugin interface is in Chinese; these instructions include both English and Chinese. The plugin is **not yet listed in the Community directory**. Manual installation is available below.

## Quick start: your own Cloudflare backend

Requirements: Node.js 22 or newer, a Cloudflare account, and R2 activated in that account. Cloudflare may require a payment method to enable R2; review its current pricing yourself. The wizard does not purchase a paid Workers plan or a domain.

```sh
git clone https://github.com/javakenn/vault-cloud-sync.git
cd vault-cloud-sync
npm ci
npm run setup:cloudflare
```

The wizard opens Cloudflare login if needed, asks for your account when there are multiple accounts, and asks for a **new project name**. It creates a Worker, D1 database and private R2 bucket under that name, applies the schema, generates an administrator secret, deploys the backend, verifies health, and creates separate Mac/iPhone/Android configurations. All network calls go to your selected account and deployed service. It never connects to the author's backend.

If R2 is not enabled, activate it in the Cloudflare dashboard and run the wizard again. If a network call fails, run it again from the same directory; progress and the administrator secret are retained in `.data`. An unrelated existing D1 with the same name is rejected. See [recovery details](docs/SELF-HOSTING.md) for partial provisioning.

The generated files are **private**:

| File | Purpose |
| --- | --- |
| `wrangler.local.jsonc` | Your account/resource bindings; ignored by Git |
| `.data/admin-secret.json` | Administrator credential; never put this in the plugin |
| `.data/setup-state.json` | Provisioning progress and service URL |
| `.data/devices/notes/mac.json` | Mac device connection configuration |
| `.data/devices/notes/iphone.json` | iPhone device connection configuration |
| `.data/devices/notes/android.json` | Android device connection configuration |
| `.data/devices/notes/*-vault.zip` | Empty vault with plugin and the corresponding device credential |

Keep `.data` backed up privately. Never upload these files to a public issue, repository, or release. The same wizard invocation reuses saved device tokens; it does not silently replace a revoked token.

## Install and sync

### Desktop: existing vault

1. Back up the vault. Do not run this alongside another sync engine on the same directory.
2. From a GitHub Release or `npm run build`, copy `main.js`, `manifest.json`, and `styles.css` into `<vault config folder>/plugins/ob-collector/`. The usual config folder is `.obsidian`, but custom config folders are supported by Obsidian. Do not copy another vault's `data.json` or sync baseline.
3. Enable **Vault Cloud Sync** in Settings → Community plugins.
4. In its settings, import the contents of the device's JSON configuration, verify the connection, then enable two-way sync and run sync. Upload the first device completely before connecting the others.
5. All devices meant to share the same notes must connect to the same cloud vault; independent local vaults need separate cloud vault IDs. Never reuse one device configuration in multiple installations.

Alternatively, unzip the generated `mac-vault.zip` into a new local folder and open `Cloud Notes` as a vault. Automatic sync starts disabled.

### iPhone/iPad

1. In Obsidian, create a local vault with iCloud storage disabled so Files exposes **On My iPhone → Obsidian**.
2. Transfer `iphone-vault.zip` privately to the phone and unzip it. Preserve the complete `Cloud Notes` directory, including hidden `.obsidian` files.
3. Close Obsidian, place the complete directory under **On My iPhone → Obsidian**, and reopen Obsidian to select the vault. Do not replace an existing vault.
4. Enable the plugin, verify its prefilled connection and enable sync. Keep Obsidian open until the first download finishes. Verify a note and image in both directions before using real notes.

If Files or Obsidian does not recognize the copied local vault, stop rather than replacing existing data. Follow Obsidian's supported vault installation/migration flow; iOS sandboxing can make manual hidden-folder installation device-dependent. Physical mobile installation must still be verified on your device. Once listed, Community directory installation will replace the manual plugin installation steps, but backend configuration remains necessary.

### Android

Transfer `android-vault.zip` privately, unzip into a local folder while preserving `.obsidian`, open that folder as a vault in Obsidian, enable the plugin, verify the connection and enable sync. Grant Obsidian access to that directory. Keep the app open for synchronization.

## Manage devices and additional vaults

Open the service URL printed by the wizard. Sign in with the administrator secret from `.data/admin-secret.json` to create and revoke devices. The management page keeps credentials only in page memory; use its sign-out button afterward. Copy only a device configuration to Obsidian.

To create another isolated cloud vault with its own device packages:

```sh
npm run devices -- --vault work --platform mac --name "Work Mac"
npm run devices -- --vault work --platform iphone --name "Work iPhone"
```

The CLI reserves one saved configuration per vault/platform. For more devices of the same platform, create distinct device tokens through the management webpage. Revoking a device stops future access; it cannot erase files already downloaded to that device.

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
