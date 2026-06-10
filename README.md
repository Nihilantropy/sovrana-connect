# SovranaConnect

The native desktop client for SovranaAI. A thin cross-platform (macOS + Windows)
app that opens the customer's SovranaAI services in one closed, branded surface —
without the public-domain + DNS + TLS apparatus a browser forces.

Replaces the web shell (SovranaShell). Decision: vault **D35**.

## Status

**v0.0.2 RELEASED (2026-06-10, Windows-verified).** Multi-service launcher
(vault D37): the SovranaSuite ships standard with every partner contract, so
the app shows a branded tile per service (live status dot) and opens each one
in its own native window. One service in config → launcher is skipped (v0.0.1
full-screen flow). Mac `.dmg` verify still deferred (no Mac available).
Front-end verified on WSL; native `.exe`/`.app` built by CI or on
Windows/macOS (see `CLAUDE.md` → Build / test). See `docs/DESIGN.md` for the
briefs and brand rules.

## Quick start

```bash
npm install
npm run build          # front-end (anywhere, incl. WSL)
npm run tauri dev      # run the app (needs Windows or macOS + Rust)
```

Point it at a customer's box: copy `sovrana-connect.example.json` →
`sovrana-connect.json` next to the executable and fill `services[]` (one object
per suite module). Adding a tool = adding one object. No rebuild.

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
