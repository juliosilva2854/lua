use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Manifesto {
    pub id: String,
    pub nome: String,
    pub icone: String,
    pub cor: String,
    pub ordem: u32,
    pub secoes: Vec<Secao>,
}

#[derive(Serialize, Clone)]
pub struct Secao {
    pub titulo: String,
    pub tipo: String,
    pub itens: Vec<Item>,
}

#[derive(Serialize, Clone)]
pub struct Item {
    pub id: String,
    pub label: String,
    pub valor: Option<String>,
    pub icone: Option<String>,
}

pub mod apps;
pub mod sistemas;
pub mod lembretes;
pub mod adp;
pub mod sidecar;

pub fn todos_manifestos() -> Vec<Manifesto> {
    let mut v = vec![
        apps::manifesto(),
        sistemas::manifesto(),
        lembretes::manifesto(),
        adp::manifesto(),
    ];
    v.sort_by_key(|m| m.ordem);
    v
}

pub fn executar(
    integracao: &str,
    comando: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match integracao {
        "apps" => apps::executar(comando, args),
        "sistemas" => sistemas::executar(comando, args),
        "lembretes" => lembretes::executar(comando, args),
        "adp" => adp::executar(comando, args),
        _ => Err(format!("integração desconhecida: {}", integracao)),
    }
}