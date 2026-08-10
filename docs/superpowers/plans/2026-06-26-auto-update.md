---
tipo: piano
stato: da-classificare
updated: 2026-06-26
rif: [D35, D36]
---
# SovranaConnect Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add signed self-update to the SovranaConnect native client — default-ON user toggle in a new Settings tab; auto-apply when ON, branded "new version" notice when OFF.

**Architecture:** `tauri-plugin-updater` + `tauri-plugin-process` check a `latest.json` on GitHub Releases at startup. A user preference (`auto_update`, default true) persists in the OS app-config dir, read/written by two new Rust commands. The front-end branches on the preference: ON → download+install+relaunch; OFF → a `#update` screen with an "Aggiorna ora" button. All paths fail silently offline (D35 invariant).

**Tech Stack:** Tauri v2 (Rust shell + vanilla-TS front-end), Vite, GitHub Actions, minisign (updater signing).

## Global Constraints

- **Versions bump to `0.0.3`** in `tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json` (exact string `0.0.3`).
- **Updater endpoint is a single line** — `https://github.com/Nihilantropy/sovrana-connect/releases/latest/download/latest.json`. Host migration later = change only this URL.
- **Brand palette only** (`docs/DESIGN.md` §2): `--bg-dark #0a0a0a`, `--card-dark #141414`, `--card-border #272727`, `--accent #1a6bff`, `--white #ffffff`, `--gray #6b7280`. One accent per view. Dark only.
- **No CDN / no external scripts** — plugins are npm-bundled by Vite.
- **Italian** for all user-facing copy; **English** for code/commits/comments.
- **No `Co-Authored-By` trailer** in commits. GPG signing stays disabled.
- **Rust does not compile on this WSL host** (no `webkit2gtk`). Rust-touching tasks are verified by the CI `sanity` job (ubuntu+windows) and a human Windows run — NOT locally. Front-end tasks are verified locally with `npm run build` (tsc typecheck + Vite bundle).
- **The updater requires minisign-signed artifacts** — non-negotiable, set up in Task 2 + Task 5.

---

### Task 1: User settings store (Rust)

Persist the `auto_update` preference in `<app-config-dir>/settings.json`, separate from the operator's `sovrana-connect.json`. Absent/garbage file → default ON.

**Files:**
- Modify: `src-tauri/src/lib.rs` (add struct + helpers + 2 commands + unit tests; register commands)

**Interfaces:**
- Produces (Rust commands, callable from JS via `invoke`):
  - `get_settings() -> Settings` where `Settings { auto_update: bool }` (serializes to `{ "auto_update": true }`)
  - `set_auto_update(enabled: bool) -> Result<(), String>`
- Produces (internal): `fn parse_settings(text: &str) -> Settings`

- [ ] **Step 1: Write the failing unit test**

Add at the end of `src-tauri/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_or_garbage_defaults_to_auto_update_on() {
        assert!(parse_settings("not json at all").auto_update);
        assert!(parse_settings("{}").auto_update);
    }

    #[test]
    fn explicit_false_is_respected() {
        assert!(!parse_settings(r#"{"auto_update":false}"#).auto_update);
    }

    #[test]
    fn explicit_true_is_respected() {
        assert!(parse_settings(r#"{"auto_update":true}"#).auto_update);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (CI or a Linux/Win/Mac box with Rust + webkit deps — NOT WSL):
`cd src-tauri && cargo test parse_settings`
Expected: FAIL — `cannot find function parse_settings` / `cannot find type Settings`.
(On WSL this won't compile at all; that is expected — the CI `sanity` job is the gate.)

- [ ] **Step 3: Add the Settings type + helpers**

In `src-tauri/src/lib.rs`, after the `FileConfig` block (around line 71, before `config_path`), add:

```rust
/// User-editable preference, distinct from the operator's `sovrana-connect.json`
/// (which is the service catalog). Stored in the OS app-config dir: survives an
/// NSIS reinstall, writable without elevation. Absent/garbage => default ON.
#[derive(Serialize, Deserialize)]
struct Settings {
    #[serde(default = "default_auto_update")]
    auto_update: bool,
}

fn default_auto_update() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings { auto_update: true }
    }
}

/// Pure parse so it is unit-testable without an AppHandle. Any parse failure
/// (missing file content, bad JSON) collapses to defaults.
fn parse_settings(text: &str) -> Settings {
    serde_json::from_str::<Settings>(text).unwrap_or_default()
}

/// `<app-config-dir>/settings.json`.
fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load_settings(app: &tauri::AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|t| parse_settings(&t))
        .unwrap_or_default()
}
```

- [ ] **Step 4: Add the two commands**

In `src-tauri/src/lib.rs`, after the `get_config` command (around line 124), add:

```rust
#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
fn set_auto_update(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let path = settings_path(&app).ok_or("no app config dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&Settings { auto_update: enabled })
        .map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}
```

Note: `tauri::Manager` is already imported (line 21), which provides `app.path()`. `Serialize` + `Deserialize` are already imported (line 16).

- [ ] **Step 5: Register the commands**

In `src-tauri/src/lib.rs`, modify the `invoke_handler` (line 202):

```rust
        .invoke_handler(tauri::generate_handler![
            get_config,
            check_endpoint,
            open_service,
            get_settings,
            set_auto_update
        ])
```

- [ ] **Step 6: Run tests to verify they pass**

Run (CI/native): `cd src-tauri && cargo test`
Expected: the three `parse_settings` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(settings): persist auto_update preference in app-config dir"
```

---

### Task 2: Wire updater + process plugins (Rust + config + keypair)

Add the two plugins, their capability permissions, the updater endpoint + pubkey, and generate the signing keypair. Bump versions to 0.0.3.

**Files:**
- Modify: `src-tauri/Cargo.toml` (deps)
- Modify: `src-tauri/src/lib.rs` (register plugins)
- Modify: `src-tauri/capabilities/default.json` (permissions)
- Modify: `src-tauri/tauri.conf.json` (plugins.updater, createUpdaterArtifacts, version)
- Modify: `package.json` (front-end plugin deps, version)
- Generate: `~/.sovrana/connect-updater.key` (+ `.pub`) — OFF-repo

**Interfaces:**
- Produces: the `updater` + `process` ACLs available to the webview; `@tauri-apps/plugin-updater` `check()` and `@tauri-apps/plugin-process` `relaunch()` usable from `src/main.ts` (Task 4).

- [ ] **Step 1: Generate the signing keypair (runs anywhere, incl. WSL)**

```bash
mkdir -p ~/.sovrana
npm run tauri signer generate -- -w ~/.sovrana/connect-updater.key
```

This prints a **public key** (a base64 blob) and writes the private key to `~/.sovrana/connect-updater.key` plus `~/.sovrana/connect-updater.key.pub`. Copy the public key string for Step 4. Keep the private key + the password you set OFF the repo (used in Task 5).

- [ ] **Step 2: Add Rust plugin dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 3: Register the plugins**

In `src-tauri/src/lib.rs`, modify `run()` (line 201) so the builder reads:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            check_endpoint,
            open_service,
            get_settings,
            set_auto_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running SovranaConnect");
```

- [ ] **Step 4: Add capability permissions + updater config**

Replace `src-tauri/capabilities/default.json` with:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "updater:default",
    "process:default"
  ]
}
```

In `src-tauri/tauri.conf.json`, set `version` to `0.0.3`, add a top-level `plugins` block, and add `createUpdaterArtifacts` to `bundle`. The file becomes:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "SovranaConnect",
  "version": "0.0.3",
  "identifier": "com.sovranaai.connect",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:14200",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "SovranaConnect",
        "width": 1280,
        "height": 832,
        "minWidth": 900,
        "minHeight": 600,
        "maximized": true,
        "resizable": true,
        "decorations": true,
        "backgroundColor": "#0A0A0A",
        "theme": "Dark"
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/Nihilantropy/sovrana-connect/releases/latest/download/latest.json"
      ],
      "pubkey": "PASTE_PUBLIC_KEY_FROM_STEP_1"
    }
  },
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    "targets": ["nsis", "app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    }
  }
}
```

Replace `PASTE_PUBLIC_KEY_FROM_STEP_1` with the actual public key string from Step 1.

- [ ] **Step 5: Add front-end plugin packages + version bump**

In `package.json`, set `"version": "0.0.3"` and add to `dependencies`:

```json
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-updater": "^2",
    "@tauri-apps/plugin-process": "^2"
```

In `src-tauri/Cargo.toml`, set `version = "0.0.3"`.

Then install:

```bash
npm install
```

- [ ] **Step 6: Verify front-end still builds (WSL-runnable)**

Run: `npm run build`
Expected: PASS (tsc typecheck + Vite bundle succeed; new deps resolve).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs \
        src-tauri/capabilities/default.json src-tauri/tauri.conf.json \
        package.json package-lock.json
git commit -m "feat(updater): wire tauri-plugin-updater + process, bump to 0.0.3"
```

---

### Task 3: Settings screen + global gear (front-end)

Add a `#settings` screen with the auto-update toggle, and one global fixed gear button that opens it. The gear lives in `<body>` outside the screens, so it shows on splash/launcher/error/update and vanishes when single-service mode replaces the document on redirect — satisfying the 4-screen requirement with one element.

**Files:**
- Modify: `index.html` (gear button + settings + update screens)
- Modify: `src/styles.css` (gear, settings, update, toggle styles)
- Modify: `src/main.ts` (screens map, settings open/close, toggle wiring)

**Interfaces:**
- Consumes: `get_settings`, `set_auto_update` (Task 1).
- Produces (TS, used by Task 4): `screens` map keys `settings` and `update`; `let cachedAutoUpdate: boolean`; `function openSettings(): void`; `function show(which): void`.

- [ ] **Step 1: Add the gear, settings screen, and update screen to `index.html`**

Insert before the closing `</body>` (after the `#error` block, line 33):

```html
    <!-- Update notice: shown when a newer release exists and auto-update is OFF,
         or as progress while auto-update installs. Built/toggled by main.ts. -->
    <main id="update" class="screen hidden">
      <img class="wordmark" src="/src/assets/sovranaai-wordmark.png" alt="SovranaAI" />
      <p class="update-title" id="update-title">Nuova versione disponibile</p>
      <p class="update-version" id="update-version"></p>
      <div class="update-actions" id="update-actions">
        <button id="update-now" class="btn-accent" type="button">Aggiorna ora</button>
        <button id="update-later" class="btn-ghost" type="button">Più tardi</button>
      </div>
      <div class="spinner hidden" id="update-spinner" role="status" aria-label="Aggiornamento in corso"></div>
    </main>

    <!-- Settings: reachable from the global gear. v0.0.3 = one toggle. -->
    <main id="settings" class="screen hidden">
      <img class="wordmark" src="/src/assets/sovranaai-wordmark.png" alt="SovranaAI" />
      <div class="settings-panel">
        <label class="settings-row" for="toggle-auto-update">
          <span class="settings-label">Aggiornamenti automatici</span>
          <input id="toggle-auto-update" class="toggle" type="checkbox" />
        </label>
        <p class="settings-hint">Quando attivo, SovranaConnect installa i nuovi aggiornamenti all'avvio.</p>
      </div>
      <button id="settings-back" class="btn-ghost" type="button">Indietro</button>
    </main>

    <!-- Global gear: present on every SovranaConnect chrome screen. The document
         is replaced on single-service redirect, so it never overlays a service. -->
    <button id="gear" class="gear" type="button" aria-label="Impostazioni" title="Impostazioni">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.6"/>
        <path d="M19.4 13a7.6 7.6 0 0 0 .06-2l1.7-1.32-1.7-2.94-2.05.82a7.6 7.6 0 0 0-1.74-1l-.31-2.16h-3.4l-.31 2.16a7.6 7.6 0 0 0-1.74 1l-2.05-.82-1.7 2.94L5.54 11a7.6 7.6 0 0 0 0 2l-1.7 1.32 1.7 2.94 2.05-.82c.53.42 1.12.76 1.74 1l.31 2.16h3.4l.31-2.16c.62-.24 1.21-.58 1.74-1l2.05.82 1.7-2.94L19.4 13Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
    </button>
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
/* Global settings gear — fixed top-right, muted until hover (one-accent rule:
   the gear is neutral chrome, not an accent action). */
.gear {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--card-border);
  border-radius: 10px;
  background-color: var(--card-dark);
  color: var(--gray);
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.gear:hover {
  color: var(--white);
  border-color: var(--gray);
}

/* Settings panel */
.settings-panel {
  width: 100%;
  max-width: 420px;
  background-color: var(--card-dark);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 24px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
}
.settings-label {
  font-size: 15px;
  color: var(--white);
}
.settings-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--gray);
}

/* Toggle: accent when on, neutral when off. */
.toggle {
  appearance: none;
  -webkit-appearance: none;
  width: 44px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 999px;
  background-color: var(--card-border);
  position: relative;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.toggle::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--white);
  transition: transform 150ms ease;
}
.toggle:checked {
  background-color: var(--accent);
}
.toggle:checked::after {
  transform: translateX(18px);
}

/* Update screen */
.update-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--white);
  margin: 0;
}
.update-version {
  font-size: 14px;
  color: var(--gray);
  margin: 0;
}
.update-actions {
  display: flex;
  gap: 12px;
}

/* Ghost button: neutral secondary action (keeps single accent per view). */
.btn-ghost {
  appearance: none;
  border: 1px solid var(--card-border);
  background-color: transparent;
  color: var(--white);
  font-size: 14px;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 150ms ease;
}
.btn-ghost:hover {
  border-color: var(--gray);
}
```

- [ ] **Step 3: Add settings screens + open/close + toggle wiring to `src/main.ts`**

Add `settings` and `update` to the `screens` map (line 20):

```ts
const screens = {
  splash: () => document.getElementById("splash")!,
  launcher: () => document.getElementById("launcher")!,
  error: () => document.getElementById("error")!,
  update: () => document.getElementById("update")!,
  settings: () => document.getElementById("settings")!,
};
```

Add near the top (after `PROBE_INTERVAL_MS`, line 18):

```ts
// Cached so the update flow (below) and the toggle share one source of truth.
let cachedAutoUpdate = true;
// Where "Indietro" returns to. Multi-service: launcher. Single-service: re-run.
let onSettingsClose: () => void = () => show("launcher");
```

Add these functions before `// --- entry`:

```ts
async function openSettings(): Promise<void> {
  const settings = await invoke<{ auto_update: boolean }>("get_settings");
  cachedAutoUpdate = settings.auto_update;
  const toggle = document.getElementById("toggle-auto-update") as HTMLInputElement | null;
  if (toggle) toggle.checked = settings.auto_update;
  show("settings");
}

function wireSettings(): void {
  document.getElementById("gear")?.addEventListener("click", () => void openSettings());
  document.getElementById("settings-back")?.addEventListener("click", () => onSettingsClose());
  const toggle = document.getElementById("toggle-auto-update") as HTMLInputElement | null;
  toggle?.addEventListener("change", () => {
    cachedAutoUpdate = toggle.checked;
    void invoke("set_auto_update", { enabled: toggle.checked });
  });
}
```

- [ ] **Step 4: Call `wireSettings()` from bootstrap + set close target per mode**

Modify `bootstrap()` (line 133):

```ts
function bootstrap(): void {
  wireSettings();
  document.getElementById("retry")?.addEventListener("click", () => void start());
  void start();
}
```

Modify `start()` (line 120) so multi-service close returns to launcher and single-service close re-runs start:

```ts
async function start(): Promise<void> {
  const cfg = await invoke<Config>("get_config");

  if (cfg.services.length === 1) {
    onSettingsClose = () => void start();
    await connectSingle(cfg.services[0]);
    return;
  }

  onSettingsClose = () => show("launcher");
  renderLauncher(cfg);
  setInterval(() => void probeAll(cfg.services), PROBE_INTERVAL_MS);
  window.addEventListener("focus", () => void probeAll(cfg.services));
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS. Manually confirm in `dist/` the bundle exists (no tsc errors).

- [ ] **Step 6: Commit**

```bash
git add index.html src/styles.css src/main.ts
git commit -m "feat(settings): add Settings screen, auto-update toggle, global gear"
```

---

### Task 4: Startup update check + flow (front-end)

Detect a newer release at startup, offline-safe and time-boxed. ON → install + relaunch. OFF → `#update` notice. Multi-service adds zero latency; single-service races the check before redirect.

**Files:**
- Modify: `src/main.ts` (imports, update orchestration, hook into both modes)

**Interfaces:**
- Consumes: `@tauri-apps/plugin-updater` `check()`, `@tauri-apps/plugin-process` `relaunch()`, `cachedAutoUpdate`, `show()`, `screens` (Task 3).
- Produces: `async function checkForUpdate(): Promise<Update | null>`; `async function handleUpdate(update: Update, proceed: () => void): Promise<void>`.

- [ ] **Step 1: Add imports + constant**

At the top of `src/main.ts`, below the existing `invoke` import (line 1):

```ts
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
```

Add near `PROBE_INTERVAL_MS` (line 18):

```ts
// Startup update check is bounded so single-service mode never stalls on a dead
// network before redirecting. Offline returns fast; this caps the online wait.
const UPDATE_CHECK_TIMEOUT_MS = 3_000;
```

- [ ] **Step 2: Add the time-boxed, fail-silent checker**

Add before `// --- entry`:

```ts
// Returns the available Update, or null if up-to-date / offline / errored /
// slower than the timeout. NEVER throws — the updater is pure convenience and
// must not block startup (D35 offline-first invariant).
async function checkForUpdate(): Promise<Update | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), UPDATE_CHECK_TIMEOUT_MS),
    );
    const result = await Promise.race([
      check({ timeout: UPDATE_CHECK_TIMEOUT_MS }),
      timeout,
    ]);
    return result ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Add the update handler (ON installs, OFF notifies)**

Add after `checkForUpdate`:

```ts
// `proceed` is what happens when the user declines / after a check finds nothing
// in single-service mode (continue to the service). In multi-service it is a no-op.
async function handleUpdate(update: Update, proceed: () => void): Promise<void> {
  const settings = await invoke<{ auto_update: boolean }>("get_settings");
  cachedAutoUpdate = settings.auto_update;

  const versionEl = document.getElementById("update-version");
  if (versionEl) versionEl.textContent = `Versione ${update.version}`;

  const title = document.getElementById("update-title")!;
  const actions = document.getElementById("update-actions")!;
  const spinner = document.getElementById("update-spinner")!;

  async function install(): Promise<void> {
    title.textContent = "Aggiornamento in corso";
    actions.classList.add("hidden");
    spinner.classList.remove("hidden");
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      // Install failed (e.g. lost network mid-download): fall back to proceeding.
      proceed();
    }
  }

  if (cachedAutoUpdate) {
    show("update");
    await install();
    return;
  }

  // OFF: notice with explicit choice.
  title.textContent = "Nuova versione disponibile";
  actions.classList.remove("hidden");
  spinner.classList.add("hidden");
  const now = document.getElementById("update-now")!;
  const later = document.getElementById("update-later")!;
  now.onclick = () => void install();
  later.onclick = () => proceed();
  show("update");
}
```

- [ ] **Step 4: Hook the check into single-service mode**

Modify `connectSingle()` (line 40) to check before redirect:

```ts
async function connectSingle(service: Service): Promise<void> {
  show("splash");

  const endpointEl = document.getElementById("error-endpoint");
  if (endpointEl) endpointEl.textContent = service.endpoint;

  const proceed = async (): Promise<void> => {
    if (await checkEndpoint(service.endpoint)) {
      window.location.replace(service.endpoint);
    } else {
      show("error");
    }
  };

  const update = await checkForUpdate();
  if (update) {
    await handleUpdate(update, () => void proceed());
    return;
  }
  await proceed();
}
```

- [ ] **Step 5: Hook the check into multi-service mode**

In `start()`, in the multi-service branch (after the `window.addEventListener("focus", ...)` line), add a background check:

```ts
  onSettingsClose = () => show("launcher");
  renderLauncher(cfg);
  setInterval(() => void probeAll(cfg.services), PROBE_INTERVAL_MS);
  window.addEventListener("focus", () => void probeAll(cfg.services));

  // Background, non-blocking: launcher already rendered. Notice/install only if found.
  void checkForUpdate().then((update) => {
    if (update) void handleUpdate(update, () => show("launcher"));
  });
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS (types from `@tauri-apps/plugin-updater` / `plugin-process` resolve; no tsc errors).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(updater): startup update check, auto-install when on, notice when off"
```

---

### Task 5: CI signing, repo public, publish runbook (operator-gated)

Make the update channel real. **These steps are outward-facing / partly irreversible — get explicit operator go-ahead before running them.**

**Files:**
- Modify: `.github/workflows/build.yml` (signing env, header comment)
- Add: `docs/RELEASE.md` (publish runbook)

- [ ] **Step 1: Add signing env to the release job**

In `.github/workflows/build.yml`, in the `release` job's `tauri-apps/tauri-action@v0` step (line 97), add the two signing vars to `env`:

```yaml
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'SovranaConnect ${{ github.ref_name }}'
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

Update the cost-control comment block at the top of the file (lines 4-8) to note the repo is now public (Actions free) — replace the "private repo, billed minutes" line with: `# Cost control (public repo — Actions free; tiers kept for wall-clock fan-out):`.

- [ ] **Step 2: Set the repo secrets (operator)**

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.sovrana/connect-updater.key --repo Nihilantropy/sovrana-connect
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Nihilantropy/sovrana-connect
# (paste the password set during Task 2 Step 1 when prompted)
```

- [ ] **Step 3: Make the repo public (operator — irreversible-ish, confirm first)**

```bash
gh repo edit Nihilantropy/sovrana-connect --visibility public --accept-visibility-change-consequences
```

- [ ] **Step 4: Write the publish runbook**

Create `docs/RELEASE.md`:

```markdown
# Releasing SovranaConnect

Updates only reach clients from a **published, non-draft, latest** GitHub Release.

1. Bump `version` in `tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json` (same value).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`
3. CI `release` job builds Windows + macOS, signs artifacts, and attaches
   `latest.json` to a **draft** Release.
4. Download the `.exe`, run it on a real Windows box. Walk `docs/DESIGN.md` §6
   brand checklist. (macOS `.dmg`/updater path still unverified — no Mac.)
5. **Publish** the Release in the GitHub UI (un-draft, mark as latest).
   Until you publish, `releases/latest/download/latest.json` does not resolve and
   no client updates.
6. If the `release` job failed mid-run, **delete the draft Release before
   rerunning** — tauri-action dies silently against a leftover draft.

The updater endpoint is pinned in `tauri.conf.json` (`plugins.updater.endpoints`).
To migrate off GitHub later, change that one URL and re-sign with the same key.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build.yml docs/RELEASE.md
git commit -m "ci(updater): sign release artifacts; add publish runbook"
```

---

### Task 6: Vault decision + doc-sync

Ratify the decision and sync every doc that describes the deferred state. Doc-sync is part of done.

**Files:**
- Modify: `../sovrana-ai-vault/wiki/decisions/log-decisioni.md` (append `D{n}`)
- Modify: `../sovrana-ai-vault/wiki/entities/sovrana-connect.md` (status)
- Modify: `../sovrana-ai-vault/wiki/log.md` (append entry)
- Modify: `CLAUDE.md` (scope/distribution/updater)
- Modify: `README.md` (status)
- Modify: `docs/DESIGN.md` (remove auto-update from "not in scope"; add updater + settings + 4-screen gear)

- [ ] **Step 1: Append the decision**

Append a new `D{n}` (use the next free number — grep the file for the last `## D`) to `sovrana-ai-vault/wiki/decisions/log-decisioni.md`. Content: SovranaConnect gains self-update via `tauri-plugin-updater`; default-ON user toggle, no operator lock; repo goes public, manifest + signed artifacts on GitHub Releases as the **interim** channel; **sovereignty note (D36)** — the update channel ships the operator's own client binary, carries **no customer data**, so a US-hosted interim channel is acceptable; **EU-host migration tracked** (endpoint is a one-line change); offline-first (D35) preserved (check is non-blocking + fail-silent). State that it supersedes the entity-page note "updater differito, NON v0.0.3" — landed in 0.0.3. Frontmatter `updated:` + append-only convention per `sovrana-ai-vault/CLAUDE.md`.

- [ ] **Step 2: Update the entity page**

In `sovrana-ai-vault/wiki/entities/sovrana-connect.md`, update the Stato section: add a 🟢 v0.0.3 line (self-update shipped; default-ON toggle; public-repo interim channel; EU migration tracked) and amend the deferred-updater sentence to "landed in 0.0.3" with a link to the new D-entry. Bump `updated:` to 2026-06-26.

- [ ] **Step 3: Append a wiki log line**

Append to `sovrana-ai-vault/wiki/log.md`: `## [2026-06-26] decision | SovranaConnect self-update (v0.0.3) + D{n}`.

- [ ] **Step 4: Sync repo docs**

- `CLAUDE.md`: in Scope, move auto-update out of "Still NOT in scope"; in Distribution, replace "Auto-update ... post-v0.0.1" with the shipped design (updater plugin, signed artifacts, public-repo interim channel, publish gate, endpoint = one config line). Add Settings tab + 4-screen gear to the front-end architecture notes.
- `README.md`: bump Status to v0.0.3 with the self-update + Settings line.
- `docs/DESIGN.md`: remove `auto-update` from the "not in scope" lists (lines ~36, ~103); add a short "Auto-update + Settings" section (toggle default ON, ON=install OFF=notice, global gear on all chrome screens, offline-safe); note the per-tile-accent deviation is unaffected.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/DESIGN.md
git commit -m "docs: sync auto-update (v0.0.3) across repo docs"
cd ../sovrana-ai-vault && git add wiki/decisions/log-decisioni.md wiki/entities/sovrana-connect.md wiki/log.md
git commit -m "decision: SovranaConnect self-update v0.0.3 + doc-sync"
```

---

## Final verification (after all tasks)

- [ ] `npm run build` passes on WSL (front-end gate).
- [ ] Push the branch; CI `sanity` job compiles Rust on ubuntu + windows (the real Rust gate).
- [ ] Tag `v0.0.3`; CI `release` job produces signed `.exe` + `.dmg` + `latest.json`.
- [ ] Operator runs `.exe` on Windows, verifies launcher + Settings toggle + (no update yet, so no notice). Publish.
- [ ] Smoke the update path: from an installed 0.0.3, publish a 0.0.4 test build, relaunch, confirm ON installs / OFF shows the notice. (Update path only exercises from the second published release on.)
- [ ] macOS path remains unverified (no Mac) — flagged, not blocking.
```
