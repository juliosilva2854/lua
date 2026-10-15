from datetime import datetime
from loguru import logger


def dia_util() -> bool:
    """
    Por enquanto retorna True sempre.
    Numa fase futura vai consultar o calendário do ADP (férias, feriados, folgas).
    """
    hoje = datetime.now()
    # fim de semana = não útil (por padrão)
    if hoje.weekday() >= 5:
        logger.info(f"{hoje.date()} é fim de semana — não é dia útil.")
        return False
    return True


def tem_conflito_agenda() -> bool:
    """
    Stub: sem integração de Google Calendar por enquanto.
    Numa fase futura vai verificar se você tem reunião no horário do ponto.
    """
    return False