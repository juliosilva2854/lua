use super::{Manifesto, Secao};

pub fn manifesto() -> Manifesto {
    Manifesto {
        id: "adp".into(),
        nome: "ADP".into(),
        icone: "⏰".into(),
        cor: "#ffb84d".into(),
        ordem: 40,
        secoes: vec![Secao {
            titulo: "Ponto".into(),
            tipo: "adp".into(),
            itens: vec![],
        }],
    }
}

pub fn executar(_comando: &str, _args: serde_json::Value) -> Result<serde_json::Value, String> {
    Err("ADP usa comandos próprios (adp_login, adp_status, adp_fechar)".into())
}

pub const SIDECAR_BASE: &str = "http://127.0.0.1:9876";