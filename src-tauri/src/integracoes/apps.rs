use super::{Item, Manifesto, Secao};
use std::process::Command;

pub fn manifesto() -> Manifesto {
    Manifesto {
        id: "apps".into(),
        nome: "Apps".into(),
        icone: "🚀".into(),
        cor: "#b9a7ff".into(),
        ordem: 10,
        secoes: vec![Secao {
            titulo: "Modos rápidos".into(),
            tipo: "botoes".into(),
            itens: vec![
                Item { id: "trabalho".into(), label: "Trabalho".into(), valor: None, icone: None },
                Item { id: "foco".into(), label: "Foco".into(), valor: None, icone: None },
                Item { id: "game".into(), label: "Game".into(), valor: None, icone: None },
            ],
        }],
    }
}

pub fn executar(comando: &str, _args: serde_json::Value) -> Result<serde_json::Value, String> {
    let alvos: Vec<&str> = match comando {
        "trabalho" => vec!["code", "spotify:", "https://app.sconnecta.com.br/"],
        "foco" => vec!["https://app.sconnecta.com.br/"],
        "game" => vec!["steam://open/bigpicture"],
        _ => return Err(format!("comando desconhecido em apps: {}", comando)),
    };

    for alvo in alvos {
        abrir_alvo(alvo)?;
        std::thread::sleep(std::time::Duration::from_millis(400));
    }

    Ok(serde_json::json!({ "ok": true }))
}

#[cfg(target_os = "windows")]
fn abrir_alvo(alvo: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    Command::new("cmd")
        .args(["/C", "start", "", alvo])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn abrir_alvo(alvo: &str) -> Result<(), String> {
    open::that(alvo).map_err(|e| e.to_string())
}