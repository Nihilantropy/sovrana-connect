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


## Regole che rompono qualcosa

- **L'app non e' mai l'unica via d'ingresso** (D35): lo stack SovranaLocal deve funzionare sulla LAN senza app e senza tunnel. Non costruire nulla che renda l'app obbligatoria.
- **Il catalogo servizi e' un contratto con `sovrana-suite`**: la suite *genera* il file (`render-catalog.sh`, servito su `:8088/sovrana-connect.json`) e tre punti derivano. Leggi `docs/riferimenti/config-cliente.md` prima di toccare `load_config`.
- **Il Rust non compila su WSL** (mancano le librerie GTK/webkit2gtk): `cargo test` e `tauri build` si fanno su Windows o macOS; su WSL vale `npm run build` + `npx tsc --noEmit`. La porta del dev server e' **14200**, non 1420.
- **Marchio vincolante:** tema scuro sempre, accento `#1A6BFF` (non il vecchio `#3B82F6`), 6 token di palette; vedi `docs/DESIGN.md`.
- **Fuori dal cancello** `make gate` (ha la sua CI su GitHub): il blocco della CI e' `npx tsc --noEmit` + `cargo test`.

## Prima di toccare X, leggi Y

| Tocchi | Leggi |
|---|---|
| Launcher multi-servizio, finestre `svc-<id>`, impostazioni, auto-update (D53), firma e distribuzione | `docs/riferimenti/scope-e-aggiornamenti.md` |
| Struttura del codice, comandi Rust, stack | `docs/riferimenti/stack.md` |
| Build per OS, bundle, CI (`.github/workflows/build.yml`), note WSL | `docs/riferimenti/build-e-ci.md` |
| `load_config`, `services[]`, file di config per cliente | `docs/riferimenti/config-cliente.md` |
| Grafica, colori, font, logo; decisioni e fonti | `docs/riferimenti/marchio-e-fonti.md`, `docs/DESIGN.md` |
| Rilascio | `docs/RELEASE.md` |

## Doc sync

Quando il codice cambia, aggiorna nello stesso commit questo `CLAUDE.md`, il `README.md` e il file sotto `docs/riferimenti/` interessato.
