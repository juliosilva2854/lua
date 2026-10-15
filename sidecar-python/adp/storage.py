import sqlite3
from datetime import datetime
from pathlib import Path
from loguru import logger
from .config import settings

DB_PATH = settings.LOGS_DIR.parent / "adp.db"


def _conn():
    return sqlite3.connect(DB_PATH)


def init_db() -> None:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS leituras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            tipo TEXT NOT NULL,
            payload TEXT
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS acoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            acao TEXT NOT NULL,
            resultado TEXT
        )
        """
    )
    conn.commit()
    conn.close()
    logger.info(f"DB inicializado em {DB_PATH}")


def registrar_leitura(tipo: str, payload: str = "") -> None:
    conn = _conn()
    conn.execute(
        "INSERT INTO leituras (ts, tipo, payload) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), tipo, payload),
    )
    conn.commit()
    conn.close()


def registrar_acao(acao: str, resultado: str = "") -> None:
    conn = _conn()
    conn.execute(
        "INSERT INTO acoes (ts, acao, resultado) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), acao, resultado),
    )
    conn.commit()
    conn.close()


def ultimas_leituras(limite: int = 10) -> list:
    conn = _conn()
    cur = conn.execute(
        "SELECT ts, tipo, payload FROM leituras ORDER BY id DESC LIMIT ?",
        (limite,),
    )
    rows = cur.fetchall()
    conn.close()
    return [{"ts": r[0], "tipo": r[1], "payload": r[2]} for r in rows]