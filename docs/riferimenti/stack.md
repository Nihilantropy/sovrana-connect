---
tipo: riferimento
stato: attivo
updated: 2026-11-09
rif: []
---

# Stack (v0.0.2)

## Stack (v0.0.2)

Tauri v2 (vanilla-TS front + Rust shell) — the lightest cross-platform path that
gives native packaging, a webview, and cert control. Scaffolded 2026-06-08;
launcher added 2026-06-10 (D37).

Architecture (deliberately tiny — see `docs/DESIGN.md`):

- **Rust shell** (`src-tauri/src/lib.rs`) exposes five commands (the
  `invoke_handler` list is the authority):
  - `get_config()` → resolves the **service catalog** (`{title, services[]}`).
    Baked defaults (Archive `:3000` + Mail `:8501` on localhost), overridable
    per-customer by a `sovrana-connect.json` dropped **next to the executable**
    (no rebuild). v1 files with a bare `endpoint` still parse (single-service).
    Template: `sovrana-connect.example.json`.
  - `check_endpoint(url)` → raw **TCP connect** with a 2.5s timeout. Reachability
    is decided in Rust, not JS, because a `fetch()` from the `tauri://` secure
    origin to a plain-HTTP LAN endpoint would be blocked as mixed content.
  - `open_service(id)` → opens that service in its own maximized native window
    (label `svc-<id>`, dark theme); focuses the existing window if already open.
    The endpoint is resolved in Rust from the config — the webview can never
    point a service window at an arbitrary URL.
  - `get_settings()` / `set_auto_update(bool)` → the auto-update preference in
    `<app-config-dir>/settings.json` (v0.0.3, D53 — see the Settings section above).
- **Front-end** (`index.html` + `src/main.ts`):
  - **N services** → branded launcher: tile per service (name, description,
    status dot), probes every 20s + on focus, click → `open_service`.
  - **1 service** → v0.0.1 flow: splash → probe → on success
    `window.location.replace(endpoint)` (top-level nav to `http://` is allowed;
    the whole window becomes the service UI, no URL bar) → on failure a calm
    branded error with one **Riprova** action.
  - All chrome follows the brand tokens in `src/styles.css` (dark `#0A0A0A`,
    accent `#1A6BFF`). Tracked deviation: status dots may show the accent on
    several tiles at once (see `docs/DESIGN.md` v0.0.2 §Brand deviation).
- **Window** (`src-tauri/tauri.conf.json`): maximized, dark, native decorations,
  `backgroundColor #0A0A0A` to avoid a white launch flash. Identifier
  `com.sovranaai.connect`.
- **Config resolution** (open-question answers, D35): endpoint via external
  config file (not baked per-customer); v0.0.1 endpoint is plain **HTTP on the
  LAN** (Phase 1) so no cert to validate — pinned-HTTPS / cert handling is
  deferred to v0.0.2; Windows packaging is **NSIS `.exe`** (lighter than WiX MSI,
  fine for unsigned).

App icon is generated from the real SovranaAI **"S" mark**
(`src-tauri/s-mark-source.png` → `make-icon.mjs` composites it on a `#0A0A0A`
tile → `app-icon-master.png` → `tauri icon`). Regenerate with `npm run icon`.
