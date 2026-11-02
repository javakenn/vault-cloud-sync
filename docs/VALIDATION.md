# Validation status

Public preview 0.3.0, checked on 2026-11-02 with Node.js 22.

- TypeScript: passed.
- Official `eslint-plugin-obsidianmd` recommended configuration: no errors. One advisory remains: the compatibility settings UI does not implement the newer Obsidian 1.13+ searchable settings definitions. Settings remain available through the plugin tab; the minimum manifest version is 1.8.0.
- 22 tests passed: sync engine, packaged plugin running against actual local Cloudflare workerd/D1/R2, provisioning resume, resource identity protection and private device packaging.
- Full Cloudflare initialization wizard exercised against a newly created, separate test deployment: account selection, D1/R2 creation, migration, Worker deployment, secret provisioning, health and three device configurations/packages passed.
- The built plugin was exercised against that real cloud deployment with distinct generated Mac/iPhone tokens: multi-chunk binary transfer, bidirectional sync, offline conflict copies and deletion propagation passed. This uses a plugin API test adapter, not a physical phone.
- Production dependency audit: zero findings. Development tooling currently includes moderate upstream advisories in the official lint toolchain; these packages are not bundled into the plugin or Worker. Do not force major transitive dependency replacements without verifying compatibility.
- Release source audit: generic Cloudflare template, no author deployment IDs or credentials, synchronized manifest/package/release versions, required assets and license present.

Not yet verified: physical iPhone and Android installation; native desktop UI in the public preview; 5 GB initial transfer, mobile large-file memory and sustained production capacity. This file does not claim marketplace approval. See RELEASING.md for submission steps.
