# Privacy and data handling

Vault Cloud Sync is self-hosted. The author does not operate a shared service for users of this repository and does not receive your notes or credentials by default.

## Data sent by the plugin

When you verify a configured connection or run synchronization, Obsidian `requestUrl` sends HTTPS requests to the service URL you selected. Requests contain your device bearer token and may contain vault-relative file paths, file contents/attachments, hashes, sizes, revision identifiers, device identifiers and modification timestamps. Synchronization scans eligible files in the current vault. The plugin does not access files outside that vault, does not load executable code from the network, and does not use browser or client analytics.

The device token and sync baseline are saved through Obsidian's plugin settings API inside that vault's configuration folder. They are not encrypted by this plugin. Do not publish or share plugin `data.json` files. Hidden directories (including the configuration folder) are excluded from the sync protocol.

## Backend storage

Your Cloudflare account stores device token hashes, device names and file version metadata in D1. File chunks are stored in a private R2 bucket. Administrator credentials are Worker secrets. Contents are not end-to-end encrypted: anyone administering your Cloudflare resources can access them. Cloudflare processes service requests and may retain operational request metadata according to your account settings and its policies. Workers Observability is enabled by the supplied template. The application does not intentionally log note contents or bearer tokens, and does not include application analytics. Review Cloudflare's own privacy terms and logging retention before deployment.

The setup CLI contacts Cloudflare through its official Wrangler CLI and then contacts only your deployed service to verify health and create devices. Authentication credentials are managed by Wrangler. The CLI saves administrator and device credentials locally under `.data`, excluded from Git. Generated private device ZIPs include a device token. Only transfer each ZIP to its intended device.

## Retention, revocation and deletion

Revoking a device denies its future API access; it cannot remove a copy already on that device. File deletion creates a synchronized tombstone; older versions and chunks remain until you intentionally remove the corresponding backend data. There is currently no automatic retention expiration or garbage collection.

Disable synchronization before uninstalling the plugin. Uninstalling does not delete local notes or cloud data. To remove cloud data permanently, first export anything you need, revoke device access, then delete your project's dedicated R2 bucket, D1 database and Worker through your own Cloudflare account. Do not delete shared infrastructure. Keep an independent backup because deleting the backend destroys its history and recovery data.

If you choose to operate this backend for other people, you are responsible for your own privacy notice, access controls, retention rules, support and applicable obligations. Do not describe the author's self-hosted defaults as a hosted service guarantee.
