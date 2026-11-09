---
tipo: riferimento
stato: attivo
updated: 2026-11-09
rif: []
---

# Config per cliente e divergenza di contratto con sovrana-suite

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
