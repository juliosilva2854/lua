use super::{Item, Manifesto, Secao};

pub fn manifesto() -> Manifesto {
    Manifesto {
        id: "sistemas".into(),
        nome: "Sistemas".into(),
        icone: "🌐".into(),
        cor: "#7cc8ff".into(),
        ordem: 20,
        secoes: vec![Secao {
            titulo: "Painéis".into(),
            tipo: "botoes".into(),
            itens: vec![
                Item { id: "painel".into(), label: "Painel".into(), valor: None, icone: None },
                Item { id: "analytics".into(), label: "Analytics".into(), valor: None, icone: None },
                Item { id: "relatorios".into(), label: "Relatórios".into(), valor: None, icone: None },
                Item { id: "logs".into(), label: "Logs".into(), valor: None, icone: None },
            ],
        }],
    }
}

pub fn executar(comando: &str, _args: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = match comando {
        "painel" => "https://app.sconnecta.com.br/",
        "analytics" => "https://app.sconnecta.com.br/analytics",
        "relatorios" => "https://app.sconnecta.com.br/reports",
        "logs" => "https://app.sconnecta.com.br/logs",
        _ => return Err(format!("comando desconhecido em sistemas: {}", comando)),
    };

    open::that(url).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true, "url": url }))
}