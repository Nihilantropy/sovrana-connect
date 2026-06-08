# SovranaConnect — v0.0.1 design brief

Source: vault **D35** (2026-06-08). This file is the build brief for the first
working version. Keep it honest as the app evolves.

## Goal of v0.0.1

The smallest thing that replaces "open a browser, type an IP:port, log in" with
"launch the SovranaConnect app, see the service full-screen." Nothing more.

```
[ SovranaConnect.app ]  ──opens──►  the customer's SovranaArchive (Open WebUI)
   stored endpoint                  in a full-screen native window
```

## In scope (v0.0.1)

1. **Single stored endpoint.** A config value: the service URL the app opens
   (e.g. `http://<server-ip>:3000` on the LAN today). Editable in a minimal
   settings view or a config file.
2. **Full-screen webview** over that endpoint. The service (Open WebUI) already
   has its own login — the app does not add auth in v0.0.1.
3. **Branded chrome.** App name, icon, window title = SovranaAI. No browser URL
   bar. This is the "closed universe" the web shell couldn't deliver.
4. **Trust without public CA.** Phase 1 endpoint is plain HTTP on the LAN, so no
   TLS to validate. When the endpoint is HTTPS with a pinned/private cert, the
   webview must accept it (cert pinning). Design the config so HTTP-LAN and
   pinned-HTTPS are both expressible.

## Out of scope (later versions)

- Multi-service launcher / drawer (back to the catalog idea, but native).
- Endpoint **discovery** (mDNS on LAN, tailnet MagicDNS) — v0.0.1 uses a saved
  endpoint; discovery is the obvious v0.0.2.
- Identity unification / single logout (the old D33 v0.0.2 "identity" goal).
- OS notifications, auto-update, code signing / notarization.
- Tunnel management (bringing the WireGuard/Tailscale link up from inside the app).

## Constraints (do not violate)

- **Convenience, not dependency.** The LAN browser path
  (`http://<server-ip>:<port>`) must keep working with the app uninstalled. The
  app is never the only way in. (D35 invariant.)
- **No app stores.** Ship the binary from the private repo.
- **Windows-first if code diverges.** Shared codebase where possible; platform
  forks behind `cfg`.
- **Minimal.** Resist adding anything not in the in-scope list for v0.0.1.

## First build-session steps (proposed)

1. `npm create tauri-app@latest` (vanilla/TS front, minimal) inside this repo;
   reconcile with the existing `CLAUDE.md` / `README.md` / `docs/`.
2. Hardcode-then-config the endpoint; load it into a full-screen webview window.
3. Brand: app name, icon, window title, no URL bar.
4. `npm run tauri build` on Windows → first `.exe`/`.msi`. Verify it opens a
   live Open WebUI endpoint full-screen.
5. Document the real build commands back into `CLAUDE.md`.

## Open questions for the build session

- Tauri v2 webview: can it accept a pinned/self-signed cert cleanly, or is
  HTTP-over-WG the simpler v0.0.1 trust path?
- Config delivery: per-customer endpoint baked at build time, or a small config
  file shipped alongside the binary?
- Windows packaging: `.msi` (WiX) vs `.exe` (NSIS) — pick the lighter one for an
  unsigned v0.0.1.
