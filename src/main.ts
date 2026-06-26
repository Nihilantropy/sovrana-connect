import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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

// Startup update check is bounded so single-service mode never stalls on a dead
// network before redirecting. Offline returns fast; this caps the online wait.
const UPDATE_CHECK_TIMEOUT_MS = 3_000;

// Cached so the update flow and the Settings toggle share one source of truth.
let cachedAutoUpdate = true;
// Where "Indietro" returns to. Multi-service: launcher. Single-service: re-run.
let onSettingsClose: () => void = () => show("launcher");

const screens = {
  splash: () => document.getElementById("splash")!,
  launcher: () => document.getElementById("launcher")!,
  error: () => document.getElementById("error")!,
  update: () => document.getElementById("update")!,
  settings: () => document.getElementById("settings")!,
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

  const proceed = async (): Promise<void> => {
    if (await checkEndpoint(service.endpoint)) {
      // Top-level navigation to http:// is allowed (mixed-content rules only block
      // subresources). The whole window becomes the service UI — no URL bar.
      window.location.replace(service.endpoint);
    } else {
      show("error");
    }
  };

  // Bounded pre-redirect update check (offline returns fast, capped otherwise).
  const update = await checkForUpdate();
  if (update) {
    await handleUpdate(update, () => void proceed());
    return;
  }
  await proceed();
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

// --- settings ----------------------------------------------------------------

async function openSettings(): Promise<void> {
  const settings = await invoke<{ auto_update: boolean }>("get_settings");
  cachedAutoUpdate = settings.auto_update;
  const toggle = document.getElementById("toggle-auto-update") as HTMLInputElement | null;
  if (toggle) toggle.checked = settings.auto_update;
  show("settings");
}

function wireSettings(): void {
  document.getElementById("gear")?.addEventListener("click", () => void openSettings());
  document.getElementById("settings-back")?.addEventListener("click", () => onSettingsClose());
  const toggle = document.getElementById("toggle-auto-update") as HTMLInputElement | null;
  toggle?.addEventListener("change", () => {
    cachedAutoUpdate = toggle.checked;
    void invoke("set_auto_update", { enabled: toggle.checked });
  });
}

// --- update ------------------------------------------------------------------

// Returns the available Update, or null if up-to-date / offline / errored /
// slower than the timeout. NEVER throws — the updater is pure convenience and
// must not block startup (D35 offline-first invariant).
async function checkForUpdate(): Promise<Update | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), UPDATE_CHECK_TIMEOUT_MS),
    );
    const result = await Promise.race([
      check({ timeout: UPDATE_CHECK_TIMEOUT_MS }),
      timeout,
    ]);
    return result ?? null;
  } catch {
    return null;
  }
}

// `proceed` is what happens when the user declines (single-service: continue to
// the service; multi-service: back to launcher).
async function handleUpdate(update: Update, proceed: () => void): Promise<void> {
  const settings = await invoke<{ auto_update: boolean }>("get_settings");
  cachedAutoUpdate = settings.auto_update;

  const versionEl = document.getElementById("update-version");
  if (versionEl) versionEl.textContent = `Versione ${update.version}`;

  const title = document.getElementById("update-title")!;
  const actions = document.getElementById("update-actions")!;
  const spinner = document.getElementById("update-spinner")!;

  const install = async (): Promise<void> => {
    title.textContent = "Aggiornamento in corso";
    actions.classList.add("hidden");
    spinner.classList.remove("hidden");
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch {
      // Install failed (e.g. lost network mid-download): fall back to proceeding.
      proceed();
    }
  };

  if (cachedAutoUpdate) {
    show("update");
    await install();
    return;
  }

  // OFF: notice with explicit choice.
  title.textContent = "Nuova versione disponibile";
  actions.classList.remove("hidden");
  spinner.classList.add("hidden");
  const now = document.getElementById("update-now")!;
  const later = document.getElementById("update-later")!;
  now.onclick = () => void install();
  later.onclick = () => proceed();
  show("update");
}

// --- entry -------------------------------------------------------------------

async function start(): Promise<void> {
  const cfg = await invoke<Config>("get_config");

  if (cfg.services.length === 1) {
    onSettingsClose = () => void start();
    await connectSingle(cfg.services[0]);
    return;
  }

  onSettingsClose = () => show("launcher");
  renderLauncher(cfg);
  setInterval(() => void probeAll(cfg.services), PROBE_INTERVAL_MS);
  window.addEventListener("focus", () => void probeAll(cfg.services));

  // Background, non-blocking: launcher already rendered. Notice/install only if found.
  void checkForUpdate().then((update) => {
    if (update) void handleUpdate(update, () => show("launcher"));
  });
}

function bootstrap(): void {
  wireSettings();
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
