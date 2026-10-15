import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from loguru import logger
import uvicorn

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


if __name__ == "__main__":
    logger.add(
        "logs/sidecar_{time}.log",
        rotation="10 MB",
        retention="7 days",
        level="DEBUG",
    )
    logger.info("Sidecar Lua ADP iniciando em http://127.0.0.1:9876")
    uvicorn.run(app, host="127.0.0.1", port=9876, log_level="info")