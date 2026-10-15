use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use once_cell::sync::OnceCell;

static SIDECAR: OnceCell<Mutex<Option<Child>>> = OnceCell::new();

fn sidecar_dir() -> PathBuf {
    // exe em `lua/src-tauri/target/debug/lua.exe`
    // pop: lua.exe → debug → target → src-tauri → lua/
    let mut p = std::env::current_exe().unwrap_or_default();
    p.pop(); // remove "lua.exe" → .../target/debug
    p.pop(); // remove "debug"   → .../target
    p.pop(); // remove "target"  → .../src-tauri
    p.pop(); // remove "src-tauri" → .../lua
    p.push("sidecar-python");
    p
}

fn porta_ocupada() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:9876".parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

pub fn subir() -> Result<(), String> {
    let cell = SIDECAR.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock().map_err(|e| e.to_string())?;

    if guard.is_some() {
        return Ok(());
    }

    // se já tem alguém respondendo na porta, assume que é o sidecar e ignora
    if porta_ocupada() {
        eprintln!("[sidecar] já está rodando em 127.0.0.1:9876 — reaproveitando");
        return Ok(());
    }

    let dir = sidecar_dir();
    if !dir.exists() {
        return Err(format!("pasta não encontrada: {:?}", dir));
    }

    let mut cmd = Command::new("python");
    cmd.current_dir(&dir);
    cmd.args(["-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "9876"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("erro ao subir sidecar: {}", e))?;

    *guard = Some(child);
    Ok(())
}

pub fn parar() {
    if let Some(cell) = SIDECAR.get() {
        if let Ok(mut guard) = cell.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}