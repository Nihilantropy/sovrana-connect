// SovranaConnect v0.0.1 — native shell.
//
// Two jobs only (D35, docs/DESIGN.md "In scope"):
//   1. resolve a single service endpoint (baked default, overridable per-customer
//      by a `sovrana-connect.json` dropped next to the executable — no rebuild);
//   2. tell the webview whether that endpoint is reachable, so the front-end can
//      hand the whole window over to it full-screen (Open WebUI etc.).
//
// Reachability is checked here, not in JS: a `fetch()` from the `tauri://` secure
// origin to a plain-HTTP LAN endpoint would be blocked as mixed content. A raw TCP
// connect has no such rule and is enough — we only need "is the host answering".

use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;

/// Baked-in fallback. Phase-1 endpoints are plain HTTP on the LAN
/// (e.g. `http://192.168.1.50:3000` = SovranaArchive / Open WebUI). Ship a
/// `sovrana-connect.json` next to the binary to point at the customer's box.
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:3000";
const DEFAULT_TITLE: &str = "SovranaConnect";

/// Config handed to the front-end.
#[derive(Serialize, Clone)]
struct Config {
    endpoint: String,
    title: String,
}

/// Shape of the optional on-disk override file. Every field optional so a partial
/// file still merges cleanly over the baked defaults.
#[derive(Deserialize, Default)]
struct FileConfig {
    endpoint: Option<String>,
    title: Option<String>,
}

/// `<dir-of-executable>/sovrana-connect.json`.
fn config_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join("sovrana-connect.json"))
}

fn load_config() -> Config {
    let mut cfg = Config {
        endpoint: DEFAULT_ENDPOINT.to_string(),
        title: DEFAULT_TITLE.to_string(),
    };
    if let Some(path) = config_path() {
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(fc) = serde_json::from_str::<FileConfig>(&text) {
                if let Some(e) = fc.endpoint {
                    if !e.trim().is_empty() {
                        cfg.endpoint = e.trim().to_string();
                    }
                }
                if let Some(t) = fc.title {
                    if !t.trim().is_empty() {
                        cfg.title = t.trim().to_string();
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

/// TCP-connect to host:port from the URL with a short timeout. `true` = reachable.
/// No TLS handshake, no HTTP request — pure "is something listening".
#[tauri::command]
fn check_endpoint(url: String) -> bool {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_config, check_endpoint])
        .run(tauri::generate_context!())
        .expect("error while running SovranaConnect");
}
