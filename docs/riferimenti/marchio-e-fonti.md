---
tipo: riferimento
stato: attivo
updated: 2026-11-09
rif: []
---

# Marchio, UI/UX e fonti di verita'

## Brand & UI/UX (binding)

Every pixel of the app's own chrome MUST follow the **"Brand & UI/UX guidelines"**
in `docs/DESIGN.md`: dark theme always, strict 6-token palette, accent
**`#1A6BFF`** (NOT the old `#3B82F6`), system font (Arial fallback, no serif),
left-aligned undistorted SovranaAI logo, and an Apple-minimal "today's macOS"
feel (restrained vibrancy/motion, one accent per view) — explicitly reconciling
the deck's "flat" rule with the Aqua aesthetic. Brand authority: vault
`wiki/concepts/brand-specs.md` reconciled to D32.

## Source of truth

- Decisions: vault **D35** (native pivot, 2-phase deploy) + **D37** (SovranaSuite
  standard + multi-service launcher) + **D36** (Connect = unifying surface) +
  **D16** (original SovranaConnect intent) + **D22** (SovranaLocal offline-first)
  + **D32** (brand accent `#1A6BFF`).
- Phase-1 LAN access (the fallback this app sits on top of):
  `sovrana-ai-stack/doc/routing.md` → "Phase 1 — LAN access".
- Connectivity model (Tailscale + self-hosted Headscale EU):
  vault `wiki/entities/sovrana-connect.md`.
