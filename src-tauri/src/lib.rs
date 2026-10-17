use rodio::{Decoder, DeviceSinkBuilder, Player};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::BufReader;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Disks, System};
use tauri::{Manager, PhysicalPosition, PhysicalSize};

mod integracoes;

const ALTURA_COLAPSADA: f64 = 40.0;

#[derive(Serialize)]
struct ProcessoTop {
    nome: String,
    cpu: f32,
}

#[derive(Serialize)]
struct SystemInfo {
    cpu_usage: f32,
    ram_used_gb: f64,
    ram_total_gb: f64,
    ram_percent: f32,
    disco_used_gb: f64,
    disco_total_gb: f64,
    disco_percent: f32,
    uptime_min: u64,
    hostname: String,
    os_nome: String,
    processos_top: Vec<ProcessoTop>,
}

#[derive(Serialize)]
struct IntegracaoPublica {
    id: String,
    nome: String,
    icone: String,
    cor: String,
    ordem: u32,
    secoes: Vec<integracoes::Secao>,
}

#[derive(Serialize, Deserialize, Clone)]
struct LuaConfig {
    tema: Option<String>,
}

impl Default for LuaConfig {
    fn default() -> Self {
        Self {
            tema: Some("escuro".into()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct Lembrete {
    id: String,
    texto: String,
    quando: Option<u64>,
    feito: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Historico {
    #[serde(default)]
    ultima_abertura: Option<u64>,
    #[serde(default)]
    ultimas_falas: Vec<String>,
    #[serde(default)]
    lembretes: Vec<Lembrete>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn historico_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("historico.json"))
}

fn ler_historico_raw(app: &tauri::AppHandle) -> Historico {
    let path = match historico_path(app) {
        Ok(p) => p,
        Err(_) => return Historico::default(),
    };
    if !path.exists() {
        return Historico::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn salvar_historico_raw(app: &tauri::AppHandle, h: &Historico) -> Result<(), String> {
    let path = historico_path(app)?;
    let raw = serde_json::to_string_pretty(h).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn ler_config(app: tauri::AppHandle) -> Result<LuaConfig, String> {
    let path = config_dir(&app)?.join("config.json");
    if !path.exists() {
        let cfg = LuaConfig::default();
        let raw = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        let _ = std::fs::write(&path, raw);
        return Ok(cfg);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn salvar_config(app: tauri::AppHandle, config: LuaConfig) -> Result<(), String> {
    let path = config_dir(&app)?.join("config.json");
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn registrar_abertura(app: tauri::AppHandle) -> Result<u64, String> {
    let mut h = ler_historico_raw(&app);
    let anterior = h.ultima_abertura.unwrap_or(0);
    h.ultima_abertura = Some(now_ms());
    salvar_historico_raw(&app, &h)?;
    Ok(anterior)
}

#[tauri::command]
fn registrar_fala(app: tauri::AppHandle, texto: String) -> Result<(), String> {
    let mut h = ler_historico_raw(&app);
    h.ultimas_falas.insert(0, texto);
    h.ultimas_falas.truncate(20);
    salvar_historico_raw(&app, &h)
}

#[tauri::command]
fn listar_lembretes(app: tauri::AppHandle) -> Result<Vec<Lembrete>, String> {
    Ok(ler_historico_raw(&app)
        .lembretes
        .into_iter()
        .filter(|l| !l.feito)
        .collect())
}

#[tauri::command]
fn adicionar_lembrete(
    app: tauri::AppHandle,
    texto: String,
    quando: Option<u64>,
) -> Result<Lembrete, String> {
    let id = format!("{:x}", now_ms());
    let l = Lembrete {
        id,
        texto,
        quando,
        feito: false,
    };
    let mut h = ler_historico_raw(&app);
    h.lembretes.push(l.clone());
    salvar_historico_raw(&app, &h)?;
    Ok(l)
}

#[tauri::command]
fn marcar_lembrete_feito(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut h = ler_historico_raw(&app);
    for l in h.lembretes.iter_mut() {
        if l.id == id {
            l.feito = true;
        }
    }
    salvar_historico_raw(&app, &h)
}

#[tauri::command]
fn remover_lembrete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut h = ler_historico_raw(&app);
    h.lembretes.retain(|l| l.id != id);
    salvar_historico_raw(&app, &h)
}

#[tauri::command]
fn lembretes_vencidos(app: tauri::AppHandle) -> Result<Vec<Lembrete>, String> {
    let agora = now_ms();
    let mut h = ler_historico_raw(&app);
    let mut vencidos = Vec::new();
    for l in h.lembretes.iter_mut() {
        if !l.feito {
            if let Some(q) = l.quando {
                if q <= agora {
                    l.feito = true;
                    vencidos.push(l.clone());
                }
            }
        }
    }
    if !vencidos.is_empty() {
        salvar_historico_raw(&app, &h)?;
    }
    Ok(vencidos)
}

#[tauri::command]
fn lembretes_retomada(app: tauri::AppHandle) -> Result<Vec<Lembrete>, String> {
    let mut h = ler_historico_raw(&app);
    let mut retomada = Vec::new();
    for l in h.lembretes.iter_mut() {
        if !l.feito && l.quando.is_none() {
            l.feito = true;
            retomada.push(l.clone());
        }
    }
    if !retomada.is_empty() {
        salvar_historico_raw(&app, &h)?;
    }
    Ok(retomada)
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu = sys.global_cpu_usage();
    let total = sys.total_memory() as f64 / 1_073_741_824.0;
    let used = sys.used_memory() as f64 / 1_073_741_824.0;
    let percent = if total > 0.0 {
        (used / total * 100.0) as f32
    } else {
        0.0
    };

    let disks = Disks::new_with_refreshed_list();
    let mut disco_total_u64: u64 = 0;
    let mut disco_livre_u64: u64 = 0;

    for d in disks.list() {
        let mp = d.mount_point().to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        let eh_principal = mp.starts_with("C:");

        #[cfg(not(target_os = "windows"))]
        let eh_principal = mp == "/";

        if eh_principal {
            disco_total_u64 = d.total_space();
            disco_livre_u64 = d.available_space();
            break;
        }
    }

    if disco_total_u64 == 0 {
        for d in disks.list() {
            if d.total_space() > disco_total_u64 {
                disco_total_u64 = d.total_space();
                disco_livre_u64 = d.available_space();
            }
        }
    }

    let disco_total = disco_total_u64 as f64 / 1_073_741_824.0;
    let disco_used = (disco_total_u64.saturating_sub(disco_livre_u64)) as f64 / 1_073_741_824.0;
    let disco_percent = if disco_total > 0.0 {
        (disco_used / disco_total * 100.0) as f32
    } else {
        0.0
    };

    let mut procs: Vec<ProcessoTop> = sys
        .processes()
        .values()
        .map(|p| ProcessoTop {
            nome: p.name().to_string_lossy().to_string(),
            cpu: p.cpu_usage(),
        })
        .collect();
    procs.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    procs.truncate(3);

    SystemInfo {
        cpu_usage: cpu,
        ram_used_gb: (used * 10.0).round() / 10.0,
        ram_total_gb: (total * 10.0).round() / 10.0,
        ram_percent: percent,
        disco_used_gb: (disco_used * 10.0).round() / 10.0,
        disco_total_gb: (disco_total * 10.0).round() / 10.0,
        disco_percent,
        uptime_min: System::uptime() / 60,
        hostname: System::host_name().unwrap_or_else(|| "PC".to_string()),
        os_nome: System::long_os_version().unwrap_or_else(|| "Windows".to_string()),
        processos_top: procs,
    }
}

#[tauri::command]
fn set_window_size(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let m_size = monitor.size();
        let m_pos = monitor.position();

        let win_width_phys = (width * scale) as i32;
        let x = m_pos.x + ((m_size.width as i32 - win_width_phys) / 2);
        let y = m_pos.y;

        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(
            win_width_phys as u32,
            (height * scale) as u32,
        ));
    }
    Ok(())
}

#[tauri::command]
fn listar_integracoes() -> Vec<IntegracaoPublica> {
    integracoes::todos_manifestos()
        .into_iter()
        .map(|m| IntegracaoPublica {
            id: m.id,
            nome: m.nome,
            icone: m.icone,
            cor: m.cor,
            ordem: m.ordem,
            secoes: m.secoes,
        })
        .collect()
}

#[tauri::command]
fn executar_comando(
    integracao: String,
    comando: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    integracoes::executar(&integracao, &comando, args.unwrap_or(serde_json::json!({})))
}

#[tauri::command]
async fn adp_status() -> Result<serde_json::Value, String> {
    let resp = reqwest::get(format!("{}/status", integracoes::adp::SIDECAR_BASE))
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_config() -> Result<serde_json::Value, String> {
    let resp = reqwest::get(format!("{}/config", integracoes::adp::SIDECAR_BASE))
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_login() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/login", integracoes::adp::SIDECAR_BASE))
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_espelho() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/espelho", integracoes::adp::SIDECAR_BASE))
        .timeout(std::time::Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_fechar() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/fechar", integracoes::adp::SIDECAR_BASE))
        .send()
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_validar_ponto() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/validar_ponto", integracoes::adp::SIDECAR_BASE))
        .timeout(std::time::Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn adp_bater_ponto(
    dry_run: bool,
    contexto: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let ctx = contexto.unwrap_or_else(|| "geral".to_string());
    let resp = client
        .post(format!("{}/bater_ponto", integracoes::adp::SIDECAR_BASE))
        .json(&serde_json::json!({ "dry_run": dry_run, "contexto": ctx }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("sidecar offline: {}", e))?;
    resp.json().await.map_err(|e| e.to_string())
}

fn cache_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("lua_cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn hash_str(s: &str) -> String {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn mp3_path_for(voz: &str, texto: &str) -> PathBuf {
    let key = format!("{}_{}", voz, texto);
    cache_dir().join(format!("{}.mp3", hash_str(&key)))
}

fn gerar_mp3(voz: &str, texto: &str, mp3_path: &PathBuf) -> Result<(), String> {
    let mp3_str = mp3_path.to_string_lossy().to_string();
    let status = Command::new("python")
        .args([
            "-m",
            "edge_tts",
            "--voice",
            voz,
            "--rate=+5%",
            "--pitch=+2Hz",
            "--text",
            texto,
            "--write-media",
            &mp3_str,
        ])
        .status()
        .map_err(|e| format!("edge-tts não encontrado: {}", e))?;

    if !status.success() {
        return Err("edge-tts falhou".into());
    }
    Ok(())
}

#[tauri::command]
async fn falar(texto: String, voice: Option<String>) -> Result<(), String> {
    let voz = voice.unwrap_or_else(|| "pt-BR-FranciscaNeural".to_string());
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let mp3_path = mp3_path_for(&voz, &texto);
        if !mp3_path.exists() {
            gerar_mp3(&voz, &texto, &mp3_path)?;
        }
        let mut sink =
            DeviceSinkBuilder::open_default_sink().map_err(|e| format!("erro áudio: {}", e))?;
        sink.log_on_drop(false);
        let player = Player::connect_new(sink.mixer());
        let file = File::open(&mp3_path).map_err(|e| e.to_string())?;
        let source = Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
        player.append(source);
        player.sleep_until_end();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn preparar_falas(frases: Vec<String>, voice: Option<String>) -> Result<(), String> {
    let voz = voice.unwrap_or_else(|| "pt-BR-FranciscaNeural".to_string());
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        for texto in frases {
            let mp3_path = mp3_path_for(&voz, &texto);
            if mp3_path.exists() {
                continue;
            }
            let _ = gerar_mp3(&voz, &texto, &mp3_path);
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn center_window_on_primary(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let scale = monitor.scale_factor();
        let m_size = monitor.size();
        let m_pos = monitor.position();

        let win_width_phys = (420.0 * scale) as i32;
        let x = m_pos.x + ((m_size.width as i32 - win_width_phys) / 2);
        let y = m_pos.y;

        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(
            win_width_phys as u32,
            (ALTURA_COLAPSADA * scale) as u32,
        ));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Procura o .env na raiz do projeto (um nível acima do src-tauri)
    let root_env = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join(".env");
    let _ = dotenvy::from_path(root_env);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            set_window_size,
            falar,
            preparar_falas,
            ler_config,
            salvar_config,
            registrar_abertura,
            registrar_fala,
            listar_lembretes,
            adicionar_lembrete,
            marcar_lembrete_feito,
            remover_lembrete,
            lembretes_vencidos,
            lembretes_retomada,
            listar_integracoes,
            executar_comando,
            adp_status,
            adp_config,
            adp_login,
            adp_espelho,
            adp_fechar,
            adp_validar_ponto,
            adp_bater_ponto,
            integracoes::github::github_iniciar_login,
            integracoes::github::github_aguardar_login,
            integracoes::github::github_status,
            integracoes::github::github_perfil,
            integracoes::github::github_sair,
            integracoes::github::github_repo,
            integracoes::github::github_commits,
            integracoes::github::github_prs,
            integracoes::github::github_issues,
            integracoes::whatsapp::whatsapp_config_get,
            integracoes::whatsapp::whatsapp_config_set,
            integracoes::whatsapp::whatsapp_status,
            integracoes::whatsapp::whatsapp_enviar_teste,
            integracoes::ia::testar_ia,
            open_external,
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("lua") {
                center_window_on_primary(&win);
                let _ = win.show();
                let _ = win.set_focus();
            }
            if let Err(e) = integracoes::sidecar::subir() {
                eprintln!("[sidecar] não subiu: {}", e);
            }
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                integracoes::sidecar::parar();
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao rodar Lua");
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(url).map_err(|e| e.to_string())
    }
}