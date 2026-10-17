import sys
from pathlib import Path

# Garante que o diretório do sidecar esteja no PATH para importar a pasta adp
sys.path.insert(0, str(Path(__file__).resolve().parent))

import os
import json
from dotenv import load_dotenv

# ==============================================================================
# 1. CARREGAMENTO DO .ENV (Deve ser feito ANTES de importar o ADP)
# ==============================================================================
root_dir = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=root_dir / '.env')

# ==============================================================================
# 2. IMPORTAÇÕES
# ==============================================================================
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger
import uvicorn

# SDK oficial do Google (obrigatório para chaves AQ.)
from google import genai
from google.genai import types

from adp.rpa_engine import engine
from adp.orchestrator import orquestrador
from adp.config import settings

app = FastAPI(title="Lua ADP Sidecar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# 3. MODELOS DE DADOS (PYDANTIC)
# ==============================================================================
class LoginResp(BaseModel):
    ok: bool
    url: str | None = None
    titulo: str | None = None
    erro: str | None = None

class StatusResp(BaseModel):
    vivo: bool
    logado: bool
    estado: str
    ocupado: bool
    timer_almoco_min: int

class BaterPontoReq(BaseModel):
    dry_run: bool = False
    contexto: str = "geral"

class IaRequest(BaseModel):
    mensagem: str

# ==============================================================================
# 4. ROTAS DO ADP
# ==============================================================================
@app.get("/status", response_model=StatusResp)
async def status():
    return {
        "vivo": True,
        "logado": engine.logado,
        "estado": orquestrador.estado,
        "ocupado": engine.ocupado,
        "timer_almoco_min": settings.TIMER_ALMOCO_MIN,
    }

@app.get("/config")
async def config():
    return {
        "janelas": {
            "entrada": {
                "inicio": settings.JANELA_ENTRADA_INICIO,
                "fim": settings.JANELA_ENTRADA_FIM,
            },
            "almoco": {
                "inicio": settings.JANELA_ALMOCO_INICIO,
                "fim": settings.JANELA_ALMOCO_FIM,
            },
            "saida": {
                "inicio": settings.JANELA_SAIDA_INICIO,
                "fim": settings.JANELA_SAIDA_FIM,
            },
        },
        "timer_almoco_min": settings.TIMER_ALMOCO_MIN,
    }

@app.post("/login", response_model=LoginResp)
async def login():
    logger.info("POST /login")
    return await engine.login()

@app.post("/espelho")
async def espelho():
    logger.info("POST /espelho")
    return await engine.ler_espelho()

@app.post("/validar_ponto")
async def validar_ponto():
    logger.info("POST /validar_ponto")
    return await engine.validar_ponto()

@app.post("/bater_ponto")
async def bater_ponto(req: BaterPontoReq = BaterPontoReq()):
    logger.info(f"POST /bater_ponto dry_run={req.dry_run} ctx={req.contexto}")
    return await engine.bater_ponto(dry_run=req.dry_run, contexto=req.contexto)

@app.post("/fechar")
async def fechar():
    logger.info("POST /fechar")
    await engine.fechar()
    return {"ok": True}

@app.post("/shutdown")
async def shutdown():
    logger.info("POST /shutdown")
    await engine.fechar()

    import threading, os, time
    def _kill():
        time.sleep(0.5)
        os._exit(0)

    threading.Thread(target=_kill, daemon=True).start()
    return {"ok": True}

# ==============================================================================
# 5. ROTA DE INTELIGÊNCIA ARTIFICIAL (GEMINI VIA SDK OFICIAL)
# ==============================================================================
@app.post("/ia/interpretar")
async def interpretar_ia(req: IaRequest):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"erro": "GEMINI_API_KEY não configurada no .env"}

    # Instancia o cliente oficial (lida com a troca de token das chaves AQ.)
    client = genai.Client(api_key=api_key)

    prompt = f"""
    Você é a Luna, um assistente pessoal. Sua tarefa é classificar a intenção do usuário em uma das ações pré-definidas.
    Ações possíveis: [bater_entrada, bater_saida, iniciar_almoco, voltar_almoco, status, conversa_geral].
    Se a mensagem não se encaixar em nenhuma ação de ponto ou status, classifique como 'conversa_geral'.

    Mensagem do usuário: "{req.mensagem}"
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "acao": {
                            "type": "string",
                            "enum": ["bater_entrada", "bater_saida", "iniciar_almoco", "voltar_almoco", "status", "conversa_geral"]
                        }
                    },
                    "required": ["acao"]
                }
            )
        )

        # O SDK já retorna a string JSON, precisamos apenas extrair o campo
        acao = json.loads(response.text)["acao"]
        return {"acao": acao}

    except Exception as e:
        logger.error(f"Falha na API Gemini: {str(e)}")
        return {"erro": f"Falha na API Gemini: {str(e)}"}

# ==============================================================================
# 6. INICIALIZAÇÃO DO SERVIDOR
# ==============================================================================
if __name__ == "__main__":
    logger.add(
        "logs/sidecar_{time}.log",
        rotation="10 MB",
        retention="7 days",
        level="DEBUG",
    )
    logger.info("Sidecar Lua ADP iniciando em http://127.0.0.1:9876")
    uvicorn.run(app, host="127.0.0.1", port=9876, log_level="info")