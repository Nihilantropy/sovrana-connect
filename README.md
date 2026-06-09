# SovranaConnect

The native desktop client for SovranaAI. A thin cross-platform (macOS + Windows)
app that opens the customer's SovranaAI services in one closed, branded surface —
without the public-domain + DNS + TLS apparatus a browser forces.

Replaces the web shell (SovranaShell). Decision: vault **D35**.

## Status

**v0.0.1 scaffolded (2026-06-08).** Tauri v2 (vanilla-TS front + Rust shell):
opens a configured service endpoint full-screen in a branded native window, no
URL bar. Builds verified on WSL up to the front-end + icon pipeline; the native
`.exe`/`.app` must be built on Windows/macOS (see `CLAUDE.md` → Build / test).
See `docs/DESIGN.md` for the v0.0.1 brief and brand rules.

## Quick start

```bash
npm install
npm run build          # front-end (anywhere, incl. WSL)
npm run tauri dev      # run the app (needs Windows or macOS + Rust)
```

Point it at a customer's box: copy `sovrana-connect.example.json` →
`sovrana-connect.json` next to the executable and set `endpoint`. No rebuild.

## Why native, not a browser

A browser demands a publicly-trusted cert for a public hostname → public domain +
DNS-01 cert + name resolution → **breaks offline**, against the SovranaLocal
offline-first promise. A native app pins its own cert (or runs HTTP inside the
WireGuard tunnel), discovers the endpoint itself (no public DNS), and the
"where does my data live — LAN / VPN / cloud" choice becomes an app setting.

## Distribution

Executable from a **private git repo** — no app stores. macOS + Windows
(Windows-first if the code diverges). Unsigned is fine for v0.0.1 (one-click past
the first-run OS warning).
