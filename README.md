# SovranaConnect

The native desktop client for SovranaAI. A thin cross-platform (macOS + Windows)
app that opens the customer's SovranaAI services in one closed, branded surface —
without the public-domain + DNS + TLS apparatus a browser forces.

Replaces the web shell (SovranaShell). Decision: vault **D35**.

## Status

**Repo initialized — docs only.** The Tauri project is not scaffolded yet; that
is the first build session. See `CLAUDE.md` for what this is and `docs/DESIGN.md`
for the v0.0.1 brief.

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
