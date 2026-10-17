use serde_json::json;

#[derive(Debug, PartialEq)]
pub enum Acao {
    BaterEntrada,
    BaterSaida,
    IniciarAlmoco,
    VoltarAlmoco,
    Status,
    ConversaGeral,
}

pub async fn interpretar_comando(mensagem: &str) -> Result<Acao, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/ia/interpretar", super::adp::SIDECAR_BASE);

    let body = json!({ "mensagem": mensagem });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erro ao chamar sidecar Python: {}", e))?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Sidecar Python erro: {}", text));
    }

    let json_resp: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(erro) = json_resp.get("erro") {
        return Err(format!("Erro da IA no Python: {}", erro));
    }

    let acao_str = json_resp["acao"].as_str().unwrap_or("conversa_geral");

    Ok(match acao_str {
        "bater_entrada" => Acao::BaterEntrada,
        "bater_saida" => Acao::BaterSaida,
        "iniciar_almoco" => Acao::IniciarAlmoco,
        "voltar_almoco" => Acao::VoltarAlmoco,
        "status" => Acao::Status,
        _ => Acao::ConversaGeral,
    })
}

#[tauri::command]
pub async fn testar_ia(mensagem: String) -> Result<String, String> {
    let acao = interpretar_comando(&mensagem).await?;
    Ok(format!("{:?}", acao))
}