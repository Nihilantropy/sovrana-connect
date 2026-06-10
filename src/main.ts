import { invoke } from "@tauri-apps/api/core";

// SovranaConnect v0.0.2 front-end flow (D35 + D37):
//   resolve config ->
//     1 service  : probe (in Rust) -> hand the webview over full-screen, or a
//                  calm branded error with one retry (the v0.0.1 behavior);
//     N services : branded launcher, one tile per service with a live status
//                  dot; click -> Rust opens the service in its own window.

type Service = {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
};
type Config = { title: string; services: Service[] };

const PROBE_INTERVAL_MS = 20_000;

const screens = {
  splash: () => document.getElementById("splash")!,
  launcher: () => document.getElementById("launcher")!,
  error: () => document.getElementById("error")!,
};

function show(which: keyof typeof screens) {
  for (const [name, el] of Object.entries(screens)) {
    el().classList.toggle("hidden", name !== which);
  }
}

function checkEndpoint(url: string): Promise<boolean> {
  // Reachability is decided in Rust (TCP connect) — a JS fetch to a plain-HTTP
  // LAN endpoint from the tauri:// secure origin would be blocked as mixed content.
  return invoke<boolean>("check_endpoint", { url });
}

// --- single-service fast path (v0.0.1 behavior) -----------------------------

async function connectSingle(service: Service): Promise<void> {
  show("splash");

  const endpointEl = document.getElementById("error-endpoint");
  if (endpointEl) endpointEl.textContent = service.endpoint;

  if (await checkEndpoint(service.endpoint)) {
    // Top-level navigation to http:// is allowed (mixed-content rules only block
    // subresources). The whole window becomes the service UI — no URL bar.
    window.location.replace(service.endpoint);
  } else {
    show("error");
  }
}

// --- launcher (N services, D37) ----------------------------------------------

function renderLauncher(cfg: Config): void {
  const subtitle = document.getElementById("launcher-subtitle");
  if (subtitle && cfg.title !== "SovranaConnect") subtitle.textContent = cfg.title;

  const tiles = document.getElementById("tiles")!;
  tiles.replaceChildren();

  for (const service of cfg.services) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.dataset.serviceId = service.id;

    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = service.name;

    const desc = document.createElement("span");
    desc.className = "tile-desc";
    desc.textContent = service.description ?? "";

    const status = document.createElement("span");
    status.className = "tile-status";
    status.innerHTML = `<span class="dot"></span><span class="status-label">Verifica…</span>`;

    tile.append(name, desc, status);
    tile.addEventListener("click", () => void openService(service, tile));
    tiles.append(tile);
  }

  show("launcher");
  void probeAll(cfg.services);
}

function setTileStatus(tile: Element, reachable: boolean): void {
  tile.classList.toggle("online", reachable);
  const label = tile.querySelector(".status-label");
  if (label) label.textContent = reachable ? "Operativo" : "Non raggiungibile";
}

async function probeAll(services: Service[]): Promise<void> {
  await Promise.all(
    services.map(async (service) => {
      const tile = document.querySelector(`[data-service-id="${service.id}"]`);
      if (!tile) return;
      setTileStatus(tile, await checkEndpoint(service.endpoint));
    }),
  );
}

async function openService(service: Service, tile: HTMLElement): Promise<void> {
  tile.classList.add("busy");
  try {
    const reachable = await checkEndpoint(service.endpoint);
    setTileStatus(tile, reachable);
    if (reachable) await invoke("open_service", { id: service.id });
  } finally {
    tile.classList.remove("busy");
  }
}

// --- entry -------------------------------------------------------------------

async function start(): Promise<void> {
  const cfg = await invoke<Config>("get_config");

  if (cfg.services.length === 1) {
    await connectSingle(cfg.services[0]);
    return;
  }

  renderLauncher(cfg);
  setInterval(() => void probeAll(cfg.services), PROBE_INTERVAL_MS);
  window.addEventListener("focus", () => void probeAll(cfg.services));
}

function bootstrap(): void {
  document.getElementById("retry")?.addEventListener("click", () => void start());
  void start();
}

// Module scripts are deferred: if the DOM is already parsed by the time this runs,
// DOMContentLoaded has fired and won't fire again — start immediately in that case.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
