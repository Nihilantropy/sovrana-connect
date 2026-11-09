---
tipo: riferimento
stato: attivo
updated: 2026-11-09
rif: []
---

# Scope v0.0.2, impostazioni e auto-update, distribuzione

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
