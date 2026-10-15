from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # credenciais
    ADP_USUARIO: str
    ADP_SENHA: str
    ADP_URL: str

    HEADLESS: bool = False
    TIMEOUT_PADRAO_MS: int = 30000

    # ----- janelas de horário (HH:MM) -----
    # entrada: manhã
    JANELA_ENTRADA_INICIO: str = "07:00"
    JANELA_ENTRADA_FIM: str = "10:30"

    # almoço
    JANELA_ALMOCO_INICIO: str = "11:00"
    JANELA_ALMOCO_FIM: str = "15:00"

    # saída
    JANELA_SAIDA_INICIO: str = "17:00"
    JANELA_SAIDA_FIM: str = "20:00"

    # duração do almoço em minutos (timer)
    TIMER_ALMOCO_MIN: int = 70

    LOGS_DIR: Path = BASE_DIR / "logs"


try:
    settings = Settings()
    settings.LOGS_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    raise RuntimeError(
        f"\n\n❌ Falha ao carregar configuração.\n"
        f"Verifique se o arquivo 'sidecar-python/.env' existe e tem as 3 variáveis:\n"
        f"  ADP_USUARIO, ADP_SENHA, ADP_URL\n\n"
        f"Erro original: {e}\n"
    )