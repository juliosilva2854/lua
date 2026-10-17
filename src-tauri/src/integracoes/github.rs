use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri_plugin_store::StoreExt;

static TOKEN: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
static DEVICE_CODE: Lazy<Mutex<Option<DeviceData>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone)]
struct DeviceData {
    device_code: String,
    interval: u64,
    expires_at: u64,
}

fn client_id() -> Result<String, String> {
    std::env::var("GITHUB_CLIENT_ID")
        .map_err(|_| "GITHUB_CLIENT_ID não configurado no .env".to_string())
}

fn get_token() -> Result<String, String> {
    TOKEN
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("não logado".to_string())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ============ ESTRUTURAS ============

#[derive(Serialize, Deserialize, Clone)]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Serialize)]
pub struct RepoInfo {
    pub nome: String,
    pub descricao: Option<String>,
    pub url: String,
    pub estrelas: u32,
    pub forks: u32,
    pub branch_default: String,
    pub issues_abertas: u32,
    pub linguagem: Option<String>,
    pub atualizado_em: String,
}

#[derive(Serialize)]
pub struct CommitInfo {
    pub sha: String,
    pub mensagem: String,
    pub autor: String,
    pub data: String,
}

#[derive(Serialize)]
pub struct PrInfo {
    pub numero: u64,
    pub titulo: String,
    pub autor: String,
    pub url: String,
    pub draft: bool,
    pub criado_em: String,
}

#[derive(Serialize)]
pub struct IssueInfo {
    pub numero: u64,
    pub titulo: String,
    pub autor: String,
    pub url: String,
    pub labels: Vec<String>,
    pub criado_em: String,
}

#[derive(Deserialize)]
struct DeviceCodeResp {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[derive(Deserialize)]
struct TokenResp {
    access_token: Option<String>,
    error: Option<String>,
}

// ============ LOGIN ============

#[tauri::command]
pub async fn github_iniciar_login() -> Result<serde_json::Value, String> {
    let cid = client_id()?;

    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
            let client = reqwest::blocking::Client::new();
            let resp = client
                .post("https://github.com/login/device/code")
                .header("Accept", "application/json")
                .header("User-Agent", "Lua-App")
                .form(&[("client_id", cid.as_str()), ("scope", "repo read:user")])
                .send()
                .map_err(|e| format!("erro de rede: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().unwrap_or_default();
                return Err(format!("GitHub retornou {}: {}", status, body));
            }

            let data: DeviceCodeResp = resp
                .json()
                .map_err(|e| format!("erro decodificando JSON: {}", e))?;

            let expires_at = now_secs() + data.expires_in;
            *DEVICE_CODE.lock().unwrap() = Some(DeviceData {
                device_code: data.device_code.clone(),
                interval: data.interval.max(5),
                expires_at,
            });

            Ok(serde_json::json!({
                "user_code": data.user_code,
                "verification_uri": data.verification_uri,
            }))
        })
        .await
        .map_err(|e| e.to_string())??;

    Ok(result)
}

#[tauri::command]
pub async fn github_aguardar_login(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let cid = client_id()?;

    let device = {
        let guard = DEVICE_CODE.lock().map_err(|e| e.to_string())?;
        guard.clone().ok_or("device code não iniciado")?
    };

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let client = reqwest::blocking::Client::new();
        let mut interval = device.interval;

        loop {
            if now_secs() > device.expires_at {
                return Err("tempo expirado. Tente de novo.".into());
            }

            std::thread::sleep(std::time::Duration::from_secs(interval));

            let resp = client
                .post("https://github.com/login/oauth/access_token")
                .header("Accept", "application/json")
                .header("User-Agent", "Lua-App")
                .form(&[
                    ("client_id", cid.as_str()),
                    ("device_code", device.device_code.as_str()),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ])
                .send()
                .map_err(|e| format!("erro de rede: {}", e))?;

            let data: TokenResp = resp
                .json()
                .map_err(|e| format!("erro decodificando resposta: {}", e))?;

            if let Some(token) = data.access_token {
                return Ok(token);
            }

            if let Some(err) = data.error {
                match err.as_str() {
                    "authorization_pending" => continue,
                    "slow_down" => {
                        interval += 5;
                        continue;
                    }
                    "expired_token" => return Err("código expirou".into()),
                    "access_denied" => return Err("você cancelou a autorização".into()),
                    _ => return Err(format!("erro do GitHub: {}", err)),
                }
            }

            return Err("resposta inesperada do GitHub".into());
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let store = app.store("github.json").map_err(|e| e.to_string())?;
    store.set(
        "access_token".to_string(),
        serde_json::Value::String(result.clone()),
    );
    let _ = store.save();

    *TOKEN.lock().unwrap() = Some(result);
    *DEVICE_CODE.lock().unwrap() = None;

    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn github_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    if let Ok(guard) = TOKEN.lock() {
        if guard.is_some() {
            return Ok(serde_json::json!({ "logado": true }));
        }
    }

    let store = app.store("github.json").map_err(|e| e.to_string())?;
    if let Some(v) = store.get("access_token") {
        if let Some(s) = v.as_str() {
            *TOKEN.lock().unwrap() = Some(s.to_string());
            return Ok(serde_json::json!({ "logado": true }));
        }
    }

    Ok(serde_json::json!({ "logado": false }))
}

#[tauri::command]
pub async fn github_perfil() -> Result<GithubUser, String> {
    let token = get_token()?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Lua-App")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(GithubUser {
        login: json["login"].as_str().unwrap_or("").to_string(),
        name: json["name"].as_str().map(|s| s.to_string()),
        avatar_url: json["avatar_url"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub fn github_sair(app: tauri::AppHandle) -> Result<(), String> {
    *TOKEN.lock().unwrap() = None;
    let store = app.store("github.json").map_err(|e| e.to_string())?;
    store.delete("access_token");
    let _ = store.save();
    Ok(())
}

// ============ DADOS DO REPO ============

#[tauri::command]
pub async fn github_repo(owner: String, repo: String) -> Result<RepoInfo, String> {
    let token = get_token()?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("https://api.github.com/repos/{}/{}", owner, repo))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Lua-App")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub {}: {}", status, body));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(RepoInfo {
        nome: json["full_name"].as_str().unwrap_or("").to_string(),
        descricao: json["description"].as_str().map(String::from),
        url: json["html_url"].as_str().unwrap_or("").to_string(),
        estrelas: json["stargazers_count"].as_u64().unwrap_or(0) as u32,
        forks: json["forks_count"].as_u64().unwrap_or(0) as u32,
        branch_default: json["default_branch"]
            .as_str()
            .unwrap_or("main")
            .to_string(),
        issues_abertas: json["open_issues_count"].as_u64().unwrap_or(0) as u32,
        linguagem: json["language"].as_str().map(String::from),
        atualizado_em: json["updated_at"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn github_commits(
    owner: String,
    repo: String,
    limite: Option<u32>,
) -> Result<Vec<CommitInfo>, String> {
    let token = get_token()?;
    let limite = limite.unwrap_or(5);
    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/commits?per_page={}",
            owner, repo, limite
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Lua-App")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(json
        .iter()
        .map(|c| {
            let sha_full = c["sha"].as_str().unwrap_or("");
            let sha: String = sha_full.chars().take(7).collect();

            let msg_full = c["commit"]["message"].as_str().unwrap_or("");
            let mensagem = msg_full.lines().next().unwrap_or("").to_string();

            CommitInfo {
                sha,
                mensagem,
                autor: c["commit"]["author"]["name"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                data: c["commit"]["author"]["date"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn github_prs(owner: String, repo: String) -> Result<Vec<PrInfo>, String> {
    let token = get_token()?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/pulls?state=open&per_page=10",
            owner, repo
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Lua-App")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(json
        .iter()
        .map(|p| PrInfo {
            numero: p["number"].as_u64().unwrap_or(0),
            titulo: p["title"].as_str().unwrap_or("").to_string(),
            autor: p["user"]["login"].as_str().unwrap_or("").to_string(),
            url: p["html_url"].as_str().unwrap_or("").to_string(),
            draft: p["draft"].as_bool().unwrap_or(false),
            criado_em: p["created_at"].as_str().unwrap_or("").to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn github_issues(owner: String, repo: String) -> Result<Vec<IssueInfo>, String> {
    let token = get_token()?;
    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/issues?state=open&per_page=10",
            owner, repo
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Lua-App")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

    Ok(json
        .iter()
        .filter(|i| i.get("pull_request").is_none())
        .map(|i| IssueInfo {
            numero: i["number"].as_u64().unwrap_or(0),
            titulo: i["title"].as_str().unwrap_or("").to_string(),
            autor: i["user"]["login"].as_str().unwrap_or("").to_string(),
            url: i["html_url"].as_str().unwrap_or("").to_string(),
            labels: i["labels"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|l| l["name"].as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default(),
            criado_em: i["created_at"].as_str().unwrap_or("").to_string(),
        })
        .collect())
}

// ============ MANIFESTO ============

pub fn manifesto() -> super::Manifesto {
    super::Manifesto {
        id: "github".into(),
        nome: "GitHub".into(),
        icone: "🐙".into(),
        cor: "#e6edf3".into(),
        ordem: 50,
        secoes: vec![super::Secao {
            titulo: "GitHub".into(),
            tipo: "github".into(),
            itens: vec![],
        }],
    }
}

pub fn executar(_comando: &str, _args: serde_json::Value) -> Result<serde_json::Value, String> {
    Err("GitHub usa comandos próprios".into())
}
