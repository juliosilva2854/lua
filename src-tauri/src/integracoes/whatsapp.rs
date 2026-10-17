use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::{Item, Manifesto, Secao};

const STORE_FILE: &str = "config.json";
const KEY_URL: &str = "whatsapp.url";
const KEY_API_KEY: &str = "whatsapp.api_key";
const DEFAULT_URL: &str = "http://127.0.0.1:3000";
const DEFAULT_API_KEY: &str = "lua-local-dev";
const SESSION_NAME: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsConfig {
    pub url: String,
    pub api_key: String,
}

#[derive(Debug, Serialize)]
pub struct WhatsStatus {
    pub conectado: bool,
    pub status: String,
    pub numero: Option<String>,
    pub nome: Option<String>,
}

fn ler_config(app: &AppHandle) -> WhatsConfig {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => {
            return WhatsConfig {
                url: DEFAULT_URL.to_string(),
                api_key: DEFAULT_API_KEY.to_string(),
            }
        }
    };

    let url = store
        .get(KEY_URL)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_URL.to_string());

    let api_key = store
        .get(KEY_API_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| DEFAULT_API_KEY.to_string());

    WhatsConfig { url, api_key }
}

#[tauri::command]
pub async fn whatsapp_config_get(app: AppHandle) -> Result<WhatsConfig, String> {
    Ok(ler_config(&app))
}

#[tauri::command]
pub fn whatsapp_config_set(app: AppHandle, url: String, api_key: String) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(KEY_URL, serde_json::Value::String(url));
    store.set(KEY_API_KEY, serde_json::Value::String(api_key));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn whatsapp_status(app: AppHandle) -> Result<WhatsStatus, String> {
    let cfg = ler_config(&app);
    let base = cfg.url.trim_end_matches('/').to_string();
    let client = reqwest::Client::new();

    let url = format!("{}/api/sessions/{}", base, SESSION_NAME);
    let resp = client
        .get(&url)
        .header("X-Api-Key", &cfg.api_key)
        .send()
        .await
        .map_err(|e| format!("Erro de rede: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("WAHA retornou {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let status = json
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("UNKNOWN")
        .to_string();
    let conectado = status == "WORKING";

    let (numero, nome) = if conectado {
        let me_url = format!("{}/api/sessions/{}/me", base, SESSION_NAME);
        match client
            .get(&me_url)
            .header("X-Api-Key", &cfg.api_key)
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => match r.json::<serde_json::Value>().await {
                Ok(me) => {
                    let id = me
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let push = me
                        .get("pushName")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    (id, push)
                }
                Err(_) => (None, None),
            },
            _ => (None, None),
        }
    } else {
        (None, None)
    };

    Ok(WhatsStatus {
        conectado,
        status,
        numero,
        nome,
    })
}

#[tauri::command]
pub async fn whatsapp_enviar_teste(
    app: AppHandle,
    chat_id: String,
    texto: String,
) -> Result<String, String> {
    let cfg = ler_config(&app);
    let url = format!("{}/api/sendText", cfg.url.trim_end_matches('/'));

    let body = serde_json::json!({
        "session": SESSION_NAME,
        "chatId": chat_id,
        "text": texto,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("X-Api-Key", &cfg.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erro de rede: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("WAHA {} — {}", status, text));
    }

    Ok(text)
}

// ===== Manifesto (aparece como card na home) =====

pub fn manifesto() -> Manifesto {
    Manifesto {
        id: "whatsapp".into(),
        nome: "WhatsApp".into(),
        icone: "whatsapp".into(),
        cor: "#25D366".into(),
        ordem: 60,
        secoes: vec![Secao {
            titulo: "WhatsApp".into(),
            tipo: "whatsapp".into(),
            itens: vec![] as Vec<Item>,
        }],
    }
}

pub fn executar(
    _comando: &str,
    _args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({}))
}