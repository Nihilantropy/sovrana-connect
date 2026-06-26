# Releasing SovranaConnect

Updates only reach clients from a **published, non-draft, latest** GitHub Release
(D53). Drafts are not served by `releases/latest/download/latest.json`.

## One-time setup (operator)

1. Generate the updater signing keypair (any host, incl. WSL):
   ```bash
   mkdir -p ~/.sovrana
   npm run tauri signer generate -- -w ~/.sovrana/connect-updater.key
   ```
   Copy the printed **public key** into `src-tauri/tauri.conf.json`
   (`plugins.updater.pubkey`, replacing the `REPLACE_WITH_...` placeholder).
   Keep the private key + password off the repo.
2. Set the repo secrets:
   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.sovrana/connect-updater.key --repo Nihilantropy/sovrana-connect
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Nihilantropy/sovrana-connect
   ```
3. Make the repo public (so the public Releases serve the manifest + binaries):
   ```bash
   gh repo edit Nihilantropy/sovrana-connect --visibility public --accept-visibility-change-consequences
   ```

## Per release

1. Bump `version` in `tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`
   (same value).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`
3. CI `release` job builds Windows + macOS, signs the artifacts, and attaches
   `latest.json` to a **draft** Release.
4. Download the `.exe`, run it on a real Windows box. Walk `docs/DESIGN.md` §6
   brand checklist. (macOS `.dmg` / updater path still unverified — no Mac.)
5. **Publish** the Release (un-draft, mark as latest). Until you publish,
   `releases/latest/download/latest.json` does not resolve and no client updates.
6. If the `release` job failed mid-run, **delete the draft Release before
   rerunning** — tauri-action dies silently against a leftover draft.

## Migrating the update host later

The endpoint is one line in `src-tauri/tauri.conf.json`
(`plugins.updater.endpoints`). To move off GitHub to an EU host, change that URL
and re-sign with the same key (or a new key + new `pubkey`). No other code change.
