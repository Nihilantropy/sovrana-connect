---
tipo: riferimento
stato: attivo
updated: 2026-11-09
rif: []
---

# Output dei bundle, toolchain per sistema operativo, note WSL, CI

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
