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
3. Brand: app name, window title, dark `#0A0A0A` chrome, no URL bar — follow
   "Brand & UI/UX guidelines" below. Obtain the SovranaAI logo (see §4) and
   generate `icon.icns` / `icon.ico` + Tauri's PNG icon set from the "S" mark.
4. `npm run tauri build` on Windows → first `.exe`/`.msi`. Verify it opens a
   live Open WebUI endpoint full-screen and passes the §6 brand checklist.
5. Document the real build commands back into `CLAUDE.md`.

## Open questions for the build session

- Tauri v2 webview: can it accept a pinned/self-signed cert cleanly, or is
  HTTP-over-WG the simpler v0.0.1 trust path?
- Config delivery: per-customer endpoint baked at build time, or a small config
  file shipped alongside the binary?
- Windows packaging: `.msi` (WiX) vs `.exe` (NSIS) — pick the lighter one for an
  unsigned v0.0.1.

---

# v0.0.2 — multi-service launcher (vault D37)

Source: vault **D37** (2026-06-10). The SovranaSuite (SovranaMail + SovranaArchive
+ future Sovrana tools) ships standard with every partner contract (refines D36),
so the client surface must present N services, not one. The modules stay the
existing open-source web UIs (Open WebUI, Streamlit) — SovranaConnect frames
them, it does not replace them.

## In scope (v0.0.2)

1. **Config schema v2.** `sovrana-connect.json` gains a `services` array
   (`id`, `name`, `endpoint`, optional `description`). Adding a Sovrana tool to a
   customer = adding one object to the array — no rebuild, no new binary.
   Backward compatible: a v1 file with a bare `endpoint` still works (becomes a
   single-service config).
2. **Launcher home** (main window): branded header + one tile per service with a
   live status dot (TCP probe, re-checked periodically and on window focus).
   Click a reachable tile → the service opens. Unreachable tile says so calmly.
3. **Window-per-service navigation.** Each service opens in its own native
   window (label `svc-<id>`, maximized, dark). The launcher window stays alive —
   "back to home" is just the launcher window, no in-page chrome over the
   service. Re-clicking a tile focuses the existing window. This deliberately
   avoids (a) iframes — the D33/D34 pain, and (b) the one-way
   `location.replace` of v0.0.1, and it lets Mail + Archive run side-by-side.
4. **Single-service fast path.** If the resolved config has exactly one service,
   skip the launcher and behave exactly like v0.0.1 (probe → full-screen in the
   main window).

## Out of scope (unchanged from v0.0.1 list)

Endpoint discovery (mDNS/MagicDNS), settings UI, identity unification,
notifications, auto-update, signing, tunnel management. Cert-pinning/HTTPS
transport stays the v0.0.3+ track (D35 Phase-2).

## Brand deviation (tracked)

The per-tile status dot uses the `#1A6BFF` accent on potentially several tiles
at once — a point exception to the one-accent-per-view rule (§2 below), accepted
in D37 because the dots are 8px signals, not actions; the read-first element of
the launcher remains the tile grid itself.

---

# Brand & UI/UX guidelines (MUST follow)

These are binding for any pixel SovranaConnect renders — the app's own chrome
(window, splash, settings, error/empty states). The embedded service UI (Open
WebUI) keeps its own theme; these rules govern everything *around* it.

**Authority.** The brand source of truth is the vault
`sovrana-ai-vault/wiki/concepts/brand-specs.md`, **reconciled to the v2 pitch
deck per decision D32**: the primary accent is **`#1A6BFF`** (NOT the older
`#3B82F6` still written in `brand-specs.md` from v6.1 — that file is pending
reconciliation; do not copy its accent). When in doubt, follow this section.

## 1. Theme — dark, always

Dark theme is mandatory and deliberate (premium, serious, "AI seria per aziende
serie" — regulated entities, sensitive data). **Never** ship a light/white app
surface. No light-gray fills that wash out against the near-black.

## 2. Palette — these tokens only

Strict palette. Every element lands on one of these. No green / gold / red /
purple / sentiment colors.

| Role | Hex | Use |
|---|---|---|
| BG Dark | `#0A0A0A` | window background, splash, outermost surface |
| Card Dark | `#141414` | panels, settings cards, dialogs, modals |
| Card Border | `#272727` | thin 1px borders, dividers, separators |
| **Brand Blue (accent)** | `#1A6BFF` | THE single accent: primary action, focus ring, active state, links, the brand tick, spinner |
| White | `#FFFFFF` | titles, primary text |
| Gray | `#6B7280` | secondary text, captions, disclaimers, placeholder |
| Light Blue (rare) | `#78B4FF` | only if a second blue is unavoidable (e.g. hover on accent). Default: don't use it. |

**One-accent rule.** One `#1A6BFF` read-first element per view. A single strong
blue action beats five blue labels. Don't scatter the accent.

## 3. Typography

- **Native font stack** for an Apple-correct feel:
  `-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", Arial, "Helvetica Neue", sans-serif`.
  → SF on macOS, Segoe on Windows, **Arial** as the brand-canonical fallback.
- **No serif, ever.** No Times, no Comic Sans, no decorative faces.
- Scale (suggested, refine in build): Title 22–26px bold · Section 16px bold ·
  Body 14px / line-height 1.6 · Caption/footer 11–12px · Kicker 11px bold
  UPPERCASE with subtle letter-spacing.
- Body line-height generous (1.5–1.65). Titles tighter (1.2).

> **Deviation flag:** `brand-specs.md` makes Arial the canonical face. Using the
> system font for native chrome is a deliberate, Apple-aligned choice — track it
> as a brand-spec reconciliation (like the D32 accent) rather than silently
> diverging. Arial stays in the stack as the explicit fallback.

## 4. Logo

- The mark is the SovranaAI **"S sovrana" wordmark** + the **"S" icon** (icon-only
  for the app/dock/taskbar).
- **Assets to obtain (build-session task), do NOT fabricate:** canonical sources
  are the deck PNGs (`raw/presentazioni/SovranaAI_Proposta_v6.1.pptx` →
  `ppt/media/image1.png` cover, `image2.png` footer) or request current SVG/PNG
  from the operator. Generate `icon.icns` (macOS) + `icon.ico` (Windows) +
  Tauri's required PNG set from the **icon mark**. Do **not** hotlink the
  MailerLite-hosted email logo URLs into the app.
- **Placement:** always **left-aligned**, never centered. **Never distort** —
  scale by height only, preserve aspect ratio. Give it clear space; don't crowd.

## 5. Apple / Aqua design language — and how it reconciles with "flat brand"

Aim: **minimal, elegant, intuitive, simple** — the macOS feel. There is a real
tension to resolve: modern Apple UI uses **materials** (translucency, vibrancy,
depth, soft motion) while `brand-specs.md` says "flat, no gradient, no shadow,
no glow." **Resolution for the app:**

- The "flat, no gradient/shadow" rule was written for **static PPTX decks**. A
  native app may use Apple **materials sparingly** as the *one* concession to the
  Aqua feel — translucency/vibrancy is the modern macOS idiom, not 2003 glossy
  gel buttons. "Aqua style" here = **today's macOS** (clarity, depth-through-
  blur, restraint), **not** skeuomorphic gloss, pinstripes, or candy gradients.
- **Allowed (use with restraint):**
  - A vibrancy/translucent window background or sidebar (macOS `NSVisualEffect`
    / Tauri window effects) over `#0A0A0A`, kept dark and subtle.
  - **One** soft, low-opacity elevation shadow to float a modal/dialog off the
    backdrop. Not on every card.
  - Gentle, fast motion: 150–250ms ease-out for view transitions, focus, hover.
    Spring/physics easing is fine. No bouncy, no spinning, no attention-grabbing.
  - Rounded corners (≈10–12px on cards/buttons, matching macOS), hairline
    `#272727` borders.
- **Still forbidden (brand floor holds):** color gradients as fill, heavy drop
  shadows / glows, sentiment colors, more than one accent per view, busy
  textures, decorative chrome, anything that reads as "AI magic."

### Apple-feel principles (apply throughout)

- **Generous whitespace.** Let dark surfaces breathe; don't fill the window.
  Align to an 8px spacing grid (8/16/24/32). Outer padding ≥ 24px.
- **One primary action per view.** It's the `#1A6BFF` element. Secondary actions
  are quiet (gray text/ghost buttons).
- **Content first, chrome invisible.** No browser URL bar, no visible menus you
  don't need. The service should feel like it *is* the app.
- **Clarity over cleverness.** Plain Italian labels, obvious affordances, no
  jargon in the UI. A non-technical owner (the buyer) must get it instantly.
- **Calm, consistent states.** Loading = a single centered `#1A6BFF` spinner on
  `#0A0A0A`. Error/empty = one short line of white text + one quiet action. Never
  a stack trace, never a raw IP/error code in the client's face.
- **Crisp at any DPI.** Vector/SVG icons, multi-resolution app icon, sharp on
  Retina and Windows scaling.

## 6. v0.0.1 brand acceptance checklist

Before calling the app "done", verify:

- [ ] Window background `#0A0A0A`; no white/light surface anywhere in app chrome.
- [ ] Exactly the palette tokens above; accent is `#1A6BFF` (never `#3B82F6`).
- [ ] At most one `#1A6BFF` read-first element per view.
- [ ] System font renders (SF on mac / Segoe on Windows), Arial fallback present;
      no serif.
- [ ] App icon = SovranaAI "S" mark, left-aligned wordmark where shown, undistorted.
- [ ] No URL bar / browser chrome around the service.
- [ ] Any translucency/shadow is subtle and intentional; no gradients, no glow,
      no sentiment colors.
- [ ] Loading + error/empty states are calm, branded, jargon-free.
- [ ] Looks crisp on a Retina Mac and a 150%-scaled Windows display.
