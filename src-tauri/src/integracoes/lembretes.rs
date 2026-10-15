use super::{Manifesto, Secao};

pub fn manifesto() -> Manifesto {
    Manifesto {
        id: "lembretes".into(),
        nome: "Lembretes".into(),
        icone: "📌".into(),
        cor: "#ffc07a".into(),
        ordem: 30,
        secoes: vec![Secao {
            titulo: "Lembretes".into(),
            tipo: "lembretes".into(),
            itens: vec![],
        }],
    }
}

pub fn executar(_comando: &str, _args: serde_json::Value) -> Result<serde_json::Value, String> {
    Err("lembretes não aceita comandos genéricos".into())
}