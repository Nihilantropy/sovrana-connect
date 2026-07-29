# CLAUDE.md — sovrana-connect

The SovranaAI **native client app**: a thin cross-platform desktop wrapper that
gives the customer a single, closed, Apple-style entry point to their SovranaAI
services. Replaces the web shell (SovranaShell, deleted) as the client surface.

Decision of record: vault **D35** (2026-06-08) — realises the original
**D16** intent (native SovranaConnect, deferred by D33 to a web shell, now
restored). Read D35 before changing anything architectural.

## What it is

- **Native desktop app, not a website.** Owns what a browser refuses to: it can
  pin its own cert / speak HTTP **inside** the WireGuard tunnel (no public CA),
  discover the service endpoint itself (mDNS on LAN, tailnet MagicDNS, or saved
  config — no public DNS), and present a full-screen branded surface (dock icon,
  OS notifications).
- **Why it exists:** the web-shell path needed a public domain + DNS-01 cert +
  name resolution, which **breaks offline** and contradicts the SovranaLocal
  offline-first promise (D22). The native app makes that whole apparatus optional.
- **Endpoint-agnostic.** "Where the KB / service lives — LAN box, VPN server, or
  cloud — the client's choice" becomes an app **connection profile**, not a DNS
  problem.

## Hard invariant (inherited from D35)

The app is a **convenience surface, never a hard dependency**. The SovranaLocal
stack (ai-stack + Ollama) must keep working on the LAN with the app absent and
with the Tailscale/Headscale tunnel off. The browser-on-LAN path
(`http://<server-ip>:<port>`, Phase 1) stays as a zero-install fallback. Don't
build anything that makes the app the only way in.

## Scope — v0.0.2 (multi-service launcher, D37)

The SovranaSuite (Mail + Archive + future Sovrana tools) ships standard with
every partner contract (vault **D37**, 2026-06-10, refines D36), so the app
presents the customer's whole catalog:

1. Resolves a per-customer **service catalog** (`services[]` in the config file;
   adding a tool = adding one JSON object, no rebuild).
2. **Launcher home**: branded tile per service + live status dot (TCP probe,
   re-checked every 20s and on window focus).
3. Click → the service opens in its **own native window** (label `svc-<id>`,
   maximized, dark; re-click = focus). The launcher window stays alive as home —
   no iframes (D33/D34 pain), no one-way `location.replace` trap, Mail + Archive
   can run side-by-side.
4. **Single-service fast path**: exactly one service in config → skip the
   launcher, v0.0.1 behavior (probe → full-screen in the main window).
5. Trusts the connection without a public cert (plain HTTP on LAN, Phase 1).

Still NOT in scope: SSO/identity unification, endpoint discovery beyond the
config file (mDNS/MagicDNS), HTTPS/cert-pinning transport, notifications. Those
are later Phase-2 (D35). **Auto-update landed in v0.0.3** (D53) — see below.

## Settings + auto-update (v0.0.3, D53)

A new **Settings tab** (one toggle, **Aggiornamenti automatici**, default ON),
reached by a global gear icon present on every chrome screen (splash, launcher,
error, update). The preference persists in `<app-config-dir>/settings.json` (two
Rust commands `get_settings` / `set_auto_update`), separate from the operator's
`sovrana-connect.json`.

`tauri-plugin-updater` + `tauri-plugin-process` run a startup `check()`
(non-blocking, fail-silent offline — D35 invariant; bounded by
`UPDATE_CHECK_TIMEOUT_MS`, 3s). Toggle ON → `downloadAndInstall()` + relaunch.
Toggle OFF → branded "Nuova versione disponibile" screen with an **Aggiorna ora**
button. Multi-service adds zero latency (launcher renders first, check runs in
background); single-service races the check before the redirect.

The design/plan scaffolding for this feature — `docs/superpowers/specs/2026-06-26-auto-update-design.md`,
`docs/superpowers/plans/2026-06-26-auto-update.md` and the review diff in
`.superpowers/sdd/` (~41 KB total) — describes work that is **already in `main`
(v0.0.3)**. Archivable: the shipped behaviour is this section plus `docs/RELEASE.md`.

## Distribution (D35)

- Shipped as a signed-or-unsigned **executable from a private git repo** —
  **no Apple App Store, no Microsoft Store**.
- Targets **macOS + Windows**. If the code diverges between them, **start with
  Windows**.
- Code signing is **optional for v0.0.1** (first-run Gatekeeper / SmartScreen
  warning is acceptable for a managed-delivery product). Notarization +
  Authenticode are later polish. **Auto-update shipped in v0.0.3** (D53) via
  `tauri-plugin-updater`: minisign-signed artifacts + `latest.json` on the repo's
  **public** GitHub Releases (interim channel; endpoint is one line in
  `tauri.conf.json` → EU-host migration tracked). The minisign signing is
  distribution integrity only, distinct from Authenticode/notarization (still
  deferred). Publish gate stays human (CI drafts → operator verifies on Windows →
  publishes; drafts are not served). Runbook: `docs/RELEASE.md`.

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

## Build / test

Prereqs: Node + npm, Rust (`rustup`), and the **platform SDK for the target you
build on** — Tauri compiles a native binary per OS, there is no cross-build here.

```bash
npm install            # JS deps (one-time)
npm run build          # tsc type-check + vite build → dist/  (no native deps; runs anywhere incl. WSL)
npx tsc --noEmit       # type-check alone      — CI `quality` gate, no build output
cargo test --manifest-path src-tauri/Cargo.toml   # 3 Rust unit tests — blocking CI gate
                       # (compiles the Rust shell: same OS deps as `tauri build`, so not on bare WSL)
npm run tauri dev      # hot-reload dev app   (needs the OS webview + Rust)
npm run tauri build    # release bundle       (needs the OS webview + Rust)
npm run icon           # regenerate the icon set from the S mark (needs devDep `sharp`)
```

Bundle output: **Windows** → `.exe` (NSIS) under
`src-tauri/target/release/bundle/nsis/`. **macOS** → `.app` + `.dmg` under
`src-tauri/target/release/bundle/`.

**Per-OS toolchain:**
- **Windows:** Rust (MSVC toolchain), **WebView2 runtime** (preinstalled on Win
  10/11), and MSVC Build Tools / Windows SDK. `npm run tauri build` → unsigned
  `.exe`; first run shows a SmartScreen warning ("More info → Run anyway") —
  acceptable for v0.0.1 (D35).
- **macOS:** Rust + **Xcode Command Line Tools** (`xcode-select --install`).
  `npm run tauri build` → unsigned `.app`/`.dmg`; first run needs right-click →
  Open (Gatekeeper) — acceptable for v0.0.1 (D35).

> **WSL note (this dev host):** the front-end (`npm run build`) and the icon
> pipeline verify fine on WSL, and the Rust dependency graph resolves
> (`cargo generate-lockfile`). The **Rust app cannot compile on WSL** without
> `webkit2gtk-4.1`/GTK dev libs (apt + sudo). That's fine — the only real targets
> are **Windows + macOS**, so do `npm run tauri build` on one of those hosts.
>
> The Windows host of this dev machine has the full toolchain (nvm-windows +
> MSVC Build Tools + rustup); `npm run tauri dev` in a Windows clone is the
> native verify loop — use it BEFORE tagging. WSL/webkit2gtk does not reproduce
> Windows-only webview bugs (e.g. the wry#583 sync-command deadlock fixed in
> v0.0.2). Dev server port is **14200** (not Tauri's 1420 — unbindable on this
> Windows host).

## CI — automated builds (`.github/workflows/build.yml`)

GitHub Actions matrix (Tauri compiles per-OS). Private repo → minutes are
billed (Linux 1× / Windows 2× / macOS 10×); default spending limit `$0` means
Actions **stops** at the free cap, never auto-charges.

Three jobs, not two:

- **`sanity`** — **push to `main`** *and* every **`pull_request`** → Linux + Windows
  compile gate (~24 billed min). Catches native breakage that can't surface on WSL.
  Runs `tauri-action` with `--no-bundle`: no installers, and — since
  `createUpdaterArtifacts` is on — **no updater signing**, so this job needs no
  signing key. Skipped on tags. No release.
- **`quality`** — same triggers, ubuntu-only (lint/test need no Windows):
  `npx tsc --noEmit`, `cargo fmt --check`, `cargo clippy --all-targets -D warnings`,
  `cargo test`. Blocking. Deliberately expandable (eslint, cargo-audit, …).
- **`release`** — **tag `v*`** only → Windows + macOS (10×, tag-only by design) and
  drafts a **GitHub Release** with the real artifacts (`.exe` NSIS + `.dmg`, Apple
  Silicon), signed with `TAURI_SIGNING_PRIVATE_KEY`. ~120 billed min.
- **manual** → `workflow_dispatch` button for zero auto-burn.

The macOS cost tier is a **separate job**, not a conditional matrix row: a job-level
`if` cannot read the `matrix` context (comment at the top of the workflow).

The Linux job is an **off-target compile gate** (delivery targets are Windows +
macOS per D35) — drop it to save the 1×. Signing is skipped (unsigned OK for
v0.0.1, D35); add Authenticode/Apple-notarization secrets later.

CI **builds, does not verify** — a human still runs the artifact on real OS
against a live Open WebUI and walks the `docs/DESIGN.md` §6 brand checklist.

CI gotcha: if a `release` job fails mid-run, **delete the draft Release before
rerunning** — tauri-action dies silently (no error in the log) when it finds a
draft left over from a previous attempt. `gh run rerun --failed` against an
existing draft fails every time; delete the draft, then rerun all jobs.

## Per-customer suite config

The installed app reads `sovrana-connect.json` from the **same folder as the
executable**. To point a customer at their box, copy `sovrana-connect.example.json`
to `sovrana-connect.json` and fill `services[]` — one object per suite module
(`id`, `name`, `endpoint`, optional `description`). **Adding a Sovrana tool =
adding one object. No rebuild.** Exactly one service → the app skips the
launcher and opens it full-screen. A v1 file with a bare `endpoint` field still
works. If the file is absent the app falls back to its baked defaults. The real
per-customer file is git-ignored; only the `.example.json` template is committed.

### Contract divergence with sovrana-suite (read before touching `load_config`)

The suite already **generates** that file: `sovrana-suite/scripts/render-catalog.sh`
renders `sovrana-connect.json` from `suite.yaml` (every service with `connect: true`,
endpoint `http://$SUITE_LAN_HOST:<port>`) and the `catalog` container serves it at
**`:8088/sovrana-connect.json`**. Four things follow, and three of them are drift:

- **The HTTP fetch does not exist.** `render-catalog.sh` claims "SovranaConnect v0.0.3
  fetches it from A (zero desktop visits per new tile)". It does not: `load_config()`
  reads **only** `<exe-dir>/sovrana-connect.json` (`config_path()` = `current_exe()`'s
  parent), and there is no HTTP client in `src-tauri/Cargo.toml` (`tauri`,
  `tauri-plugin-updater`, `tauri-plugin-process`, `serde`, `serde_json`, `url` — no
  `reqwest`, no `tauri-plugin-http`) nor any `fetch()` in `src/`. Today the rendered
  JSON still has to be **copied next to the executable by hand, per desktop**. Either
  implement the fetch (with the file as offline fallback — D35 invariant) or correct
  the suite's comment; don't leave the suite believing a capability we don't ship.
- **The baked defaults are stale.** `default_services()` ships Archive
  `http://127.0.0.1:3000` + Mail `http://127.0.0.1:8501`; the suite publishes Archive
  on **`:8080`** and the Mail UI on **`:8090`** (edge basic-auth proxy in front of the
  container's 8501) with id **`mail-dashboard`** — `mail` in `suite.yaml` is the
  headless poller (`port: 0`, `connect: false`). A config-less install therefore
  probes three wrong things.
- **A service the file never contemplated:** `ui` = **SovranaUI** on **`:8650`**
  (agent profile, D86) is `connect: true` and is now the customer's main tile —
  the app's "Mail + Archive" framing above predates it. `brain-web` (`:8640`) is
  published but `connect: false`, so it is deliberately *not* a tile.
- **Connect is a release gate of the suite, and doesn't know it.** `sovrana-suite/CLAUDE.md`
  ("UX contract rule"): a service may not be `connect: true` without an Italian
  client-facing `description`, a working `health` endpoint, **and "a verified tile
  render in the real SovranaConnect app" (human gate)**. Breaking the launcher blocks
  suite releases, not just this repo's.

## Brand & UI/UX (binding)

Every pixel of the app's own chrome MUST follow the **"Brand & UI/UX guidelines"**
in `docs/DESIGN.md`: dark theme always, strict 6-token palette, accent
**`#1A6BFF`** (NOT the old `#3B82F6`), system font (Arial fallback, no serif),
left-aligned undistorted SovranaAI logo, and an Apple-minimal "today's macOS"
feel (restrained vibrancy/motion, one accent per view) — explicitly reconciling
the deck's "flat" rule with the Aqua aesthetic. Brand authority: vault
`wiki/concepts/brand-specs.md` reconciled to D32.

## Source of truth

- Decisions: vault **D35** (native pivot, 2-phase deploy) + **D37** (SovranaSuite
  standard + multi-service launcher) + **D36** (Connect = unifying surface) +
  **D16** (original SovranaConnect intent) + **D22** (SovranaLocal offline-first)
  + **D32** (brand accent `#1A6BFF`).
- Phase-1 LAN access (the fallback this app sits on top of):
  `sovrana-ai-stack/doc/routing.md` → "Phase 1 — LAN access".
- Connectivity model (Tailscale + self-hosted Headscale EU):
  vault `wiki/entities/sovrana-connect.md`.
