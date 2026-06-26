# SovranaConnect auto-update — design

- **Date:** 2026-06-26
- **Target version:** 0.0.3
- **Status:** approved (brainstorm), pending implementation plan
- **Decisions touched:** D35 (offline-first invariant), D36 (EU-only sovereignty), D37 (suite standard / launcher). New vault `D{n}` required (see §9).

---

## 1. Goal

Add self-update to the SovranaConnect native client.

- A **Settings tab** (new) with one toggle: **Aggiornamenti automatici**, default **ON**.
- **ON:** on launch, if a newer signed release is detected, download + install + relaunch automatically.
- **OFF:** on launch, if a newer release is detected, show a calm branded message with the new version + notes + an **"Aggiorna ora"** button (and a way to proceed without updating).
- Must honor the **offline-first invariant (D35)**: the update check never blocks, never becomes a hard dependency, and fails silently with no internet.

Non-technical SMB customers under managed delivery rarely reinstall by hand. Default-ON keeps the fleet current; the toggle is an escape hatch for change-controlled or air-gapped sites.

---

## 2. Mechanism + version source

- Plugin: **`tauri-plugin-updater`** (Tauri v2 native) + **`tauri-plugin-process`** (for `relaunch()`).
- **Running version** is baked at build from `tauri.conf.json` `version`. **Available version** lives in `latest.json` on the GitHub Release. The plugin's `check()` compares the running version against the manifest version. No new "version store" beyond the manifest.
- The updater **endpoint is a single config line** in `tauri.conf.json`:
  ```
  https://github.com/Nihilantropy/sovrana-connect/releases/latest/download/latest.json
  ```
  Migrating the host later (to an EU endpoint) = change this one URL and re-sign. The code is decoupled from the host by design.

---

## 3. Hosting + signing (interim, low-effort)

Per operator steer: use the most convenient option now, migrate the host later.

- **Repo becomes public** → its own GitHub Releases serve the manifest + binaries. CI already drafts those Releases. Side effect: CI minutes become free (repo currently private + billed). Source carries no secrets (customer endpoints are git-ignored; `sovrana-connect.example.json` holds placeholder IPs only — verified 2026-06-26).
- The updater **requires minisign-signed artifacts** (cannot be disabled). Setup:
  - Generate a keypair once: `npm run tauri signer generate -- -w ~/.sovrana/connect-updater.key` (kept off-repo).
  - **Public key** → `tauri.conf.json` `plugins.updater.pubkey`.
  - **Private key + password** → repo secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
  - `bundle.createUpdaterArtifacts: true` so tauri-action emits the signed updater bundles + `latest.json`.
- This signing is **app-distribution integrity only** — distinct from Authenticode / Apple notarization, which stay deferred (D35). First-run SmartScreen / Gatekeeper warning persists; post-install **updates are signature-verified** end-to-end.

### Activation gate stays human

`releases/latest/download/...` resolves to the latest **published, non-draft** release. Drafts are not served. Flow:

```
git tag v0.0.3 -> push
  -> CI release job builds Windows + macOS, signs artifacts, attaches latest.json (draft Release)
  -> operator runs the .exe on a real Windows box, verifies (docs/DESIGN.md §6 brand checklist)
  -> operator PUBLISHES the Release
  -> releases/latest now serves it; clients pick it up on next launch
```

Nothing auto-ships to customers until a human publishes. Preserves the existing verify-before-ship discipline. `releaseDraft: true` stays in CI.

---

## 4. Settings persistence (new)

- New Rust struct:
  ```rust
  #[derive(Serialize, Deserialize)]
  struct Settings { auto_update: bool }
  ```
- Stored at **`app_config_dir()/settings.json`** (resolved via `tauri::Manager` / path API). Chosen over next-to-exe because it is the correct Tauri convention, is user-writable without elevation, and survives NSIS reinstall.
- Kept **separate** from the operator's `sovrana-connect.json` (that file is the service catalog / endpoints; this is an end-user preference).
- Two new commands:
  - `get_settings() -> Settings` — file absent or unparseable → default `{ auto_update: true }`.
  - `set_auto_update(enabled: bool)` — writes the file (create dir if missing).
- No operator lock / force-policy in v0.0.3 (YAGNI; add later if a customer needs change-control).

---

## 5. Front-end: Settings tab + gear

- New screen `#settings` (alongside existing `splash` / `launcher` / `error`). Content for v0.0.3 = one labelled row: **"Aggiornamenti automatici"** + a toggle bound to `get_settings` / `set_auto_update`. A **"Indietro"** control returns to the prior screen. Brand tokens only (dark `#0A0A0A`, accent `#1A6BFF`, one-accent-per-view).
- **Gear icon** opens Settings. Shown on **all four** SovranaConnect chrome screens: **splash, launcher, error, update-message**. (Decision: 4-screen, so single-service customers — who never see the launcher — can still reach Settings, including the fleeting splash window.) The gear is part of SovranaConnect chrome only; it never appears on a handed-over service webview (separate window / post-`location.replace`).
- New update-message screen `#update` (see §6).

---

## 6. Update flow (offline-safe, time-boxed)

A single constant `UPDATE_CHECK_TIMEOUT_MS` (front-end, default **3000 ms**) bounds the wait. The plugin `check()` also takes a `timeout` (set to match).

### Multi-service (suite norm, D37) — zero added latency

1. `get_config` → render launcher immediately (current behavior).
2. Fire `check()` in the background (`get_settings` in parallel).
3. On resolve:
   - **No update** or **error/offline** → nothing; launcher stays. (Errors caught + logged, never surfaced.)
   - **Update + auto_update ON** → switch to `#update` in progress mode → `downloadAndInstall(onProgress)` → `relaunch()`.
   - **Update + auto_update OFF** → show `#update` as a dismissible notice: new version, release notes (`update.body`), **"Aggiorna ora"** (runs the same install) + **"Più tardi"** (returns to launcher).

### Single-service (fast path) — bounded pre-redirect check

1. `get_config` → exactly one service.
2. `Promise.race([check(), timeout(UPDATE_CHECK_TIMEOUT_MS)])` **before** the redirect.
   - Resolves **update available** in time → `#update` screen (**"Aggiorna ora"** / **"Continua"**; Continua proceeds to the service).
   - **Timeout**, **no update**, or **error** → `window.location.replace(endpoint)` as today (v0.0.1 UX preserved).
3. Accepted tradeoff (operator-confirmed): up to `UPDATE_CHECK_TIMEOUT_MS` added startup latency in single-service mode **only when online**. Offline returns fast (tight connect timeout).

### Invariant check

Every path degrades to "proceed as today" on any failure. The updater is pure convenience; the LAN/browser fallback and the offline stack are untouched (D35).

---

## 7. Wiring + CI

- `src-tauri/Cargo.toml`: add `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`.
- `src-tauri/src/lib.rs`: register both plugins in the builder; add `get_settings` / `set_auto_update` to the command handler; add the `Settings` struct + load/save helpers (mirroring the existing `load_config` file-IO style).
- `src-tauri/capabilities/default.json`: add `updater:default` and `process:default` permissions.
- `src-tauri/tauri.conf.json`: add `plugins.updater` (`endpoints`, `pubkey`); set `bundle.createUpdaterArtifacts: true`; bump `version` → `0.0.3`. `package.json` + `Cargo.toml` versions → `0.0.3`.
- `.github/workflows/build.yml`: add `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env to the `release` job. Refresh the stale "billed minutes" header comment (repo now public → Actions free).

---

## 8. Components (isolation map)

| Unit | Responsibility | Depends on |
|---|---|---|
| `Settings` store (Rust) | read/write user prefs in app_config_dir | tauri path API, serde, fs |
| `get_settings` / `set_auto_update` (Rust cmds) | expose prefs to webview | Settings store |
| updater + process plugins | check / download / install / relaunch | signed Release + `latest.json` |
| `#settings` screen (TS) | render toggle, persist on change | the two cmds |
| `#update` screen (TS) | progress mode + notice mode | updater JS API |
| update orchestration (TS `start()`) | branch by mode + policy, time-box, fail silent | get_settings, check() |
| gear control (TS) | open `#settings` from 4 screens | screen switcher |

Each is independently testable: the Settings store via file round-trip; the screens via DOM presence; the orchestration via mocked `check()` returning null / update / throw.

---

## 9. Vault decision + doc-sync (part of done)

- Append a new `D{n}` to `wiki/decisions/log-decisioni.md`:
  - SovranaConnect gains self-update via `tauri-plugin-updater`; default-ON user toggle (no operator lock).
  - Repo goes **public**; manifest + signed artifacts on GitHub Releases as the **interim** channel.
  - **Sovereignty note (D36):** the update channel carries **no customer data** — it ships the operator's own client binary to customer devices. US-hosted interim host is acceptable for the distribution channel; **EU-host migration is tracked** (endpoint is a one-line change). Offline-first (D35) preserved: check is non-blocking + fail-silent.
  - Supersedes the entity-page note "updater differito, NON v0.0.3" → now landed in 0.0.3.
- Doc-sync in the same change set: `wiki/entities/sovrana-connect.md` (status), repo `CLAUDE.md` (scope, distribution, updater), `README.md`, `docs/DESIGN.md` (remove auto-update from "not in scope"; add updater + settings sections + the 4-screen gear).

---

## 10. Out of scope (v0.0.3)

- Operator force/lock policy for auto-update.
- EU-hosted manifest (tracked, later).
- Authenticode / Apple notarization (D35 deferred).
- Background / periodic update checks (check is startup-only).
- Multi-row settings (theme, endpoints editor, etc.) — Settings tab ships with the one toggle.
- mDNS / MagicDNS discovery, SSO, HTTPS/cert-pin transport (unchanged Phase-2 track).

---

## 11. Open verification risks

- **macOS updater path unverified** — no Mac available (same gap as v0.0.1/0.0.2 `.dmg`). The macOS updater bundle is `.app.tar.gz`, not `.dmg`; CI emits it but a human has not run a Mac→Mac update. Flag, do not block Windows.
- **First published release has no prior to update from** — the update path is exercised starting from the *second* published release. Plan a smoke: install 0.0.3, publish 0.0.4-test, confirm pickup.
- **`latest` resolution** depends on the release being published + marked latest + non-prerelease. Runbook must state: publish, do not leave draft.
