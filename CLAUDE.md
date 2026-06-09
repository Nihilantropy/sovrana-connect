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

## Scope — v0.0.1 (minimal, zero overhead)

Deliberately tiny. v0.0.1 just:
1. Stores/discovers a service endpoint.
2. Opens it full-screen (webview over the existing service UI, e.g. Open WebUI).
3. Trusts the connection without a public cert (cert pinning or HTTP-over-WG).

NOT in v0.0.1: SSO/identity unification, multi-service launcher drawer, auto
endpoint discovery beyond a saved config, notifications, auto-update. Add later.

## Distribution (D35)

- Shipped as a signed-or-unsigned **executable from a private git repo** —
  **no Apple App Store, no Microsoft Store**.
- Targets **macOS + Windows**. If the code diverges between them, **start with
  Windows**.
- Code signing is **optional for v0.0.1** (first-run Gatekeeper / SmartScreen
  warning is acceptable for a managed-delivery product). Notarization +
  Authenticode are later polish. Auto-update (Tauri updater → private repo) is
  post-v0.0.1.

## Stack (scaffolded — v0.0.1)

Tauri v2 (vanilla-TS front + Rust shell) — the lightest cross-platform path that
gives native packaging, a webview, and cert control. Scaffolded 2026-06-08.

Architecture (deliberately tiny — see `docs/DESIGN.md` "In scope"):

- **Rust shell** (`src-tauri/src/lib.rs`) exposes two commands:
  - `get_config()` → resolves the service endpoint. Baked default
    (`DEFAULT_ENDPOINT`), overridable per-customer by a `sovrana-connect.json`
    dropped **next to the executable** (no rebuild). Template:
    `sovrana-connect.example.json`.
  - `check_endpoint(url)` → raw **TCP connect** with a 2.5s timeout. Reachability
    is decided in Rust, not JS, because a `fetch()` from the `tauri://` secure
    origin to a plain-HTTP LAN endpoint would be blocked as mixed content.
- **Front-end** (`index.html` + `src/main.ts`) = branded splash → probe → on
  success `window.location.replace(endpoint)` (top-level nav to `http://` is
  allowed; the whole window becomes the service UI, no URL bar) → on failure a
  calm branded error with one **Riprova** action. All chrome follows the brand
  tokens in `src/styles.css` (dark `#0A0A0A`, accent `#1A6BFF`).
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

## Per-customer endpoint config

The installed app reads `sovrana-connect.json` from the **same folder as the
executable**. To point a customer at their box, copy `sovrana-connect.example.json`
to `sovrana-connect.json` and set `endpoint` (e.g. `http://192.168.1.50:3000`).
No rebuild. If the file is absent the app falls back to its baked default. The
real per-customer file is git-ignored; only the `.example.json` template is
committed.

## Brand & UI/UX (binding)

Every pixel of the app's own chrome MUST follow the **"Brand & UI/UX guidelines"**
in `docs/DESIGN.md`: dark theme always, strict 6-token palette, accent
**`#1A6BFF`** (NOT the old `#3B82F6`), system font (Arial fallback, no serif),
left-aligned undistorted SovranaAI logo, and an Apple-minimal "today's macOS"
feel (restrained vibrancy/motion, one accent per view) — explicitly reconciling
the deck's "flat" rule with the Aqua aesthetic. Brand authority: vault
`wiki/concepts/brand-specs.md` reconciled to D32.

## Source of truth

- Decisions: vault **D35** (native pivot, 2-phase deploy) + **D16** (original
  SovranaConnect intent) + **D22** (SovranaLocal offline-first) + **D32** (brand
  accent `#1A6BFF`).
- Phase-1 LAN access (the fallback this app sits on top of):
  `sovrana-ai-stack/doc/routing.md` → "Phase 1 — LAN access".
- Connectivity model (Tailscale + self-hosted Headscale EU):
  vault `wiki/entities/sovrana-connect.md`.
