import random
import time


def delay(min_s: float = 1.5, max_s: float = 3.5) -> None:
    """Pausa humana entre ações."""
    time.sleep(random.uniform(min_s, max_s))


FRASES_AVISO = [
    "Bom dia! Posso bater o ponto?",
    "Oi, bora bater o ponto?",
    "Hora do ponto. Posso?",
    "Bater o ponto agora?",
    "Chegou a hora. Confirma?",
]

FRASES_CONFIRMACAO = [
    "Feito.",
    "Ponto batido.",
    "Ok, registrado.",
    "Prontinho.",
]

FRASES_ERRO = [
    "Deu ruim aqui.",
    "Não consegui.",
    "Algo deu errado.",
    "Falhou, dá uma olhada.",
]


def frase_aviso() -> str:
    return random.choice(FRASES_AVISO)


def frase_confirmacao() -> str:
    return random.choice(FRASES_CONFIRMACAO)


def frase_erro() -> str:
    return random.choice(FRASES_ERRO)