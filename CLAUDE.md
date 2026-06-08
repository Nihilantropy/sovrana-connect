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

## Stack (intended, not yet scaffolded)

Tauri (web UI front + Rust shell) — the lightest cross-platform path that gives
native packaging, a webview, and cert control. The repo is currently **docs-only**;
the Tauri project is scaffolded in the first build session (see `docs/DESIGN.md`).

## Build / test

TBD — filled in once the Tauri project is scaffolded. Expected: `npm install` +
`npm run tauri dev` / `npm run tauri build`. Rust toolchain + platform SDKs
required (Windows SDK / Xcode CLT).

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
