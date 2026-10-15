from loguru import logger


class Orquestrador:
    """
    Máquina de estados do ciclo de ponto.
    Na Fase 1 só guarda o estado. Agendamento real vem na Fase 4.
    """

    def __init__(self):
        self.estado = "parado"
        self.agendamentos: list = []

    def status(self) -> dict:
        return {
            "estado": self.estado,
            "agendamentos": self.agendamentos,
        }

    def definir_estado(self, novo: str) -> None:
        logger.info(f"Orquestrador: {self.estado} → {novo}")
        self.estado = novo


orquestrador = Orquestrador()