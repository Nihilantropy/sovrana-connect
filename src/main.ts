import { invoke } from "@tauri-apps/api/core";

// SovranaConnect v0.0.1 front-end flow:
//   resolve config -> probe endpoint (in Rust) -> hand the webview over to the
//   service full-screen, or show a calm branded error with one retry.

type Config = { endpoint: string; title: string };

const screens = {
  splash: () => document.getElementById("splash")!,
  error: () => document.getElementById("error")!,
};

function show(which: "splash" | "error") {
  screens.splash().classList.toggle("hidden", which !== "splash");
  screens.error().classList.toggle("hidden", which !== "error");
}

async function connect(): Promise<void> {
  show("splash");

  const cfg = await invoke<Config>("get_config");

  const endpointEl = document.getElementById("error-endpoint");
  if (endpointEl) endpointEl.textContent = cfg.endpoint;

  // Reachability is decided in Rust (TCP connect) — a JS fetch to a plain-HTTP
  // LAN endpoint from the tauri:// secure origin would be blocked as mixed content.
  const reachable = await invoke<boolean>("check_endpoint", { url: cfg.endpoint });

  if (reachable) {
    // Top-level navigation to http:// is allowed (mixed-content rules only block
    // subresources). The whole window becomes the service UI — no URL bar.
    window.location.replace(cfg.endpoint);
  } else {
    show("error");
  }
}

function start() {
  document.getElementById("retry")?.addEventListener("click", () => {
    void connect();
  });
  void connect();
}

// Module scripts are deferred: if the DOM is already parsed by the time this runs,
// DOMContentLoaded has fired and won't fire again — start immediately in that case.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
