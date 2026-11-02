# Self-hosting and operations

Run `npm ci && npm run setup:cloudflare` from a fresh clone. The repository's `wrangler.jsonc` is a generic template with no author account IDs. The wizard writes your actual bindings to Git-ignored `wrangler.local.jsonc`, and keeps private progress under `.data`.

## Non-interactive setup

After `npx wrangler login`:

```sh
npm run setup:cloudflare -- --non-interactive --account-id YOUR_ACCOUNT_ID --name your-new-project --region apac --vault notes
```

A dedicated D1 database uses the project name, the R2 bucket uses `<project>-files`, and the Worker uses the project name. Region is a placement hint, not a data residency promise. Available hints: `apac`, `weur`, `eeur`, `enam`, `wnam`, `oc`. Jurisdiction-specific deployments need an explicit separately reviewed configuration.

The setup does not delete existing resources or run on the author's account. Existing D1 names without matching local setup state are rejected. Use a new project name or a fresh clone for a separate deployment.

## Retry and recovery

The wizard saves successful steps and keeps the same administrator secret on subsequent runs. It checks account, project name and database identity before reusing them. Changing accounts or project name in an initialized directory is rejected; use another clone.

If an API accepted resource creation but the network disconnected before local progress was saved, the next attempt can encounter an existing resource. Stop and inspect that resource and `.data/setup-state.json` rather than deleting it or forcing adoption. Do not hand-edit state unless you have verified ownership and backed it up. Rerunning does not overwrite nonempty D1 data; migrations are versioned and repeat runs do not reimport vault contents. R2 buckets remain private by default.

If a device token was revoked, the CLI will not silently replace it. Create another device through the admin page and import its configuration into the intended vault. One local CLI configuration is reserved per cloud-vault/platform pair.

## Deploy updates

```sh
git pull
npm ci
npm run check
npm test
npx wrangler d1 migrations apply DB --remote --config wrangler.local.jsonc
npm run deploy
```

Review release notes before applying migrations. `deploy` uses only your local config. Worker secrets are managed separately by Cloudflare; do not put them in the checked-in template. Preserve `.data/admin-secret.json` in a private backup and keep it out of screenshots and process arguments. To rotate, update the file privately and run `npx wrangler secret bulk .data/admin-secret.json --config wrangler.local.jsonc`.

## Local development

Create `.dev.vars` (ignored by Git) with `ADMIN_TOKEN` set to a random string of at least 24 characters, run `npm run build`, then `npx wrangler d1 migrations apply DB --local` and `npm run dev`. This uses simulated local D1/R2, not the production account. Device management is available on the local URL; plugin localhost HTTP is supported for development.

## Capacity and availability

Review current Workers CPU/subrequest, D1 and R2 limits and pricing in the Cloudflare dashboard/documentation. The project does not automatically upgrade plans. A single-file protocol maximum is not a promise that the free Workers tier or every mobile device can process that file. Object reads during integrity verification count toward requests, and all history counts toward the per-vault logical quota. Test with realistic files before moving a large vault. Workers default domains may be unreachable on some networks; use a domain you own and verify mobile connectivity if needed. This project does not purchase or configure a paid domain for you.

## Backups and teardown

The authenticated `GET /api/backup` endpoint exports revision metadata; corresponding authenticated `GET /api/chunks/<sha256>` calls export each referenced chunk. Preserve both and verify SHA-256 hashes to create a complete independent backup. R2 object metadata alone is not a complete D1 backup. You can also export D1 with Wrangler and back up the private R2 bucket using Cloudflare-supported tools. Do not treat synchronized deletion or a device's local copy as an independent backup.

Before teardown, stop clients, export D1 and R2 and verify the backup. Revoke devices and delete only the dedicated resources in your own Cloudflare dashboard when you intentionally want to destroy cloud data. The setup wizard never performs automatic cleanup or destructive resets.
