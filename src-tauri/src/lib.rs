// SovranaConnect v0.0.2 — native shell.
//
// Three jobs (D35 + D37, docs/DESIGN.md):
//   1. resolve the customer's service catalog (baked default, overridable
//      per-customer by a `sovrana-connect.json` dropped next to the executable —
//      no rebuild; a v1 file with a bare `endpoint` still works);
//   2. tell the webview whether an endpoint is reachable, so the launcher can
//      show live status dots;
//   3. open a service in its own native window (label `svc-<id>`), keeping the
//      launcher window alive as "home" — re-opening focuses the existing window.
//
// Reachability is checked here, not in JS: a `fetch()` from the `tauri://` secure
// origin to a plain-HTTP LAN endpoint would be blocked as mixed content. A raw TCP
// connect has no such rule and is enough — we only need "is the host answering".

use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

/// Baked-in fallback catalog. Phase-1 endpoints are plain HTTP on the LAN
/// (D35/D37: `:3000` = SovranaArchive / Open WebUI, `:8501` = SovranaMail /
/// Streamlit). Ship a `sovrana-connect.json` next to the binary to point at the
/// customer's box.
const DEFAULT_TITLE: &str = "SovranaConnect";

fn default_services() -> Vec<Service> {
    vec![
        Service {
            id: "archive".into(),
            name: "SovranaArchive".into(),
            endpoint: "http://127.0.0.1:3000".into(),
            description: Some("Archivio intelligente".into()),
        },
        Service {
            id: "mail".into(),
            name: "SovranaMail".into(),
            endpoint: "http://127.0.0.1:8501".into(),
            description: Some("Email intelligenti".into()),
        },
    ]
}

/// One entry of the customer's suite catalog.
#[derive(Serialize, Deserialize, Clone)]
struct Service {
    id: String,
    name: String,
    endpoint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

/// Config handed to the front-end.
#[derive(Serialize, Clone)]
struct Config {
    title: String,
    services: Vec<Service>,
}

/// Shape of the optional on-disk override file. Every field optional so a partial
/// file still merges cleanly over the baked defaults. `endpoint` is the v1 single-
/// service form, kept for backward compatibility; `services` (v2) wins if present.
#[derive(Deserialize, Default)]
struct FileConfig {
    endpoint: Option<String>,
    title: Option<String>,
    services: Option<Vec<Service>>,
}

/// User-editable preference, distinct from the operator's `sovrana-connect.json`
/// (which is the service catalog). Stored in the OS app-config dir: survives an
/// NSIS reinstall, writable without elevation. Absent/garbage => default ON.
#[derive(Serialize, Deserialize)]
struct Settings {
    #[serde(default = "default_auto_update")]
    auto_update: bool,
}

fn default_auto_update() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings { auto_update: true }
    }
}

/// Pure parse so it is unit-testable without an AppHandle. Any parse failure
/// (missing content, bad JSON) collapses to defaults.
fn parse_settings(text: &str) -> Settings {
    serde_json::from_str::<Settings>(text).unwrap_or_default()
}

/// `<app-config-dir>/settings.json`.
fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("settings.json"))
}

fn load_settings(app: &tauri::AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|t| parse_settings(&t))
        .unwrap_or_default()
}

/// `<dir-of-executable>/sovrana-connect.json`.
fn config_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join("sovrana-connect.json"))
}

fn load_config() -> Config {
    let mut cfg = Config {
        title: DEFAULT_TITLE.to_string(),
        services: default_services(),
    };
    if let Some(path) = config_path() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(fc) = serde_json::from_str::<FileConfig>(&text) {
                if let Some(t) = fc.title {
                    if !t.trim().is_empty() {
                        cfg.title = t.trim().to_string();
                    }
                }
                if let Some(services) = fc.services {
                    let services: Vec<Service> = services
                        .into_iter()
                        .filter(|s| {
                            !s.id.trim().is_empty()
                                && !s.name.trim().is_empty()
                                && !s.endpoint.trim().is_empty()
                        })
                        .collect();
                    if !services.is_empty() {
                        cfg.services = services;
                    }
                } else if let Some(e) = fc.endpoint {
                    // v1 file: one bare endpoint = a single-service catalog.
                    if !e.trim().is_empty() {
                        cfg.services = vec![Service {
                            id: "service".into(),
                            name: cfg.title.clone(),
                            endpoint: e.trim().to_string(),
                            description: None,
                        }];
                    }
                }
            }
        }
    }
    cfg
}

#[tauri::command]
fn get_config() -> Config {
    load_config()
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
fn set_auto_update(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let path = settings_path(&app).ok_or("no app config dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&Settings {
        auto_update: enabled,
    })
    .map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// TCP-connect to host:port from the URL with a short timeout. `true` = reachable.
/// No TLS handshake, no HTTP request — pure "is something listening".
/// `async` so the blocking connect (up to 2.5s on a dead endpoint) runs off the
/// main thread — sync commands run on the main thread and would freeze the UI.
#[tauri::command]
async fn check_endpoint(url: String) -> bool {
    let parsed = match url::Url::parse(&url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let host = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };
    let port = match parsed.port_or_known_default() {
        Some(p) => p,
        None => return false,
    };
    match (host, port).to_socket_addrs() {
        Ok(addrs) => addrs
            .into_iter()
            .any(|a| TcpStream::connect_timeout(&a, Duration::from_millis(2500)).is_ok()),
        Err(_) => false,
    }
}

/// Window labels only allow `a-zA-Z0-9-/:_`; config `id` is customer-editable.
fn window_label(id: &str) -> String {
    let safe: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    format!("svc-{safe}")
}

/// Open service `id` from the resolved config in its own maximized native window.
/// The endpoint is resolved here (not passed from JS) so the webview can never
/// point a service window at an arbitrary URL. If the window already exists it is
/// focused instead — the launcher stays the single home.
/// MUST be `async`: on Windows, creating a webview window from a sync command
/// deadlocks (wry#583) — the event loop can't pump WebView2 creation messages
/// while the main thread is blocked in the command. Blank window + frozen app.
#[tauri::command]
async fn open_service(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let cfg = load_config();
    let service = cfg
        .services
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("unknown service id: {id}"))?;

    let label = window_label(&service.id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    let url: tauri::Url = service
        .endpoint
        .parse()
        .map_err(|_| format!("invalid endpoint for service {id}: {}", service.endpoint))?;

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url))
        .title(&service.name)
        .inner_size(1280.0, 832.0)
        .min_inner_size(900.0, 600.0)
        .maximized(true)
        .theme(Some(tauri::Theme::Dark))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            check_endpoint,
            open_service,
            get_settings,
            set_auto_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running SovranaConnect");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_or_garbage_defaults_to_auto_update_on() {
        assert!(parse_settings("not json at all").auto_update);
        assert!(parse_settings("{}").auto_update);
    }

    #[test]
    fn explicit_false_is_respected() {
        assert!(!parse_settings(r#"{"auto_update":false}"#).auto_update);
    }

    #[test]
    fn explicit_true_is_respected() {
        assert!(parse_settings(r#"{"auto_update":true}"#).auto_update);
    }
}
