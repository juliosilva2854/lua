// ============ PERSONALIDADE DA LUA ============

export const SAUDACOES = {
    manha: [
        "Bom dia.",
        "Oi, bom dia.",
        "Bom dia! Vamos nessa?",
        "Manhã começando. Tô aqui.",
        "Oi. Bom dia, tudo pronto?",
    ],
    tarde: [
        "Boa tarde.",
        "Oi, boa tarde.",
        "Boa tarde. Bora?",
        "Tarde longa hoje, hein?",
        "Chegando pra ajudar.",
    ],
    noite: [
        "Boa noite.",
        "Oi, boa noite.",
        "Boa noite. Ainda trabalhando?",
        "Boa noite. Vamos com calma.",
        "Oi. Boa noite.",
    ],
    madrugada: [
        "Ainda acordado?",
        "Tá tarde, hein.",
        "Boa madrugada.",
        "Vai dormir não?",
        "Madrugada produtiva, aparentemente.",
    ],
};

export const FALAS_MODO: Record<string, string[]> = {
    Trabalho: [
        "Bora trabalhar.",
        "Modo trabalho. Deixa comigo.",
        "Preparando o kit de trabalho.",
        "Ok, abrindo tudo pro trabalho.",
        "Trabalho, né? Vamos nessa.",
        "Ativando modo trabalho.",
        "Já vou abrindo as coisas.",
        "Modo trabalho ligado.",
    ],
    Foco: [
        "Modo foco. Boa sorte.",
        "Silêncio e foco.",
        "Vou te deixar em paz.",
        "Foco. Só o essencial.",
        "Concentração total.",
        "Modo foco ativado.",
        "Tirando as distrações.",
    ],
    Game: [
        "Boa jogatina.",
        "Chamando a Steam.",
        "Hora de desligar o cérebro.",
        "Bora pro jogo.",
        "Modo gamer ativado.",
        "Que comecem os jogos.",
        "Divirta-se.",
    ],
};

export const FALAS_ABERTURA: Record<string, string[]> = {
    Painel: ["Abrindo o painel.", "Painel na tela.", "Lá vai o painel.", "Painel abrindo."],
    Analytics: ["Abrindo analytics.", "Indo pros números.", "Analytics na área.", "Bora ver os dados."],
    Relatórios: ["Abrindo relatórios.", "Bora ver os dados.", "Relatórios na tela.", "Indo pros relatórios."],
    Logs: ["Abrindo logs.", "Indo ver o que aconteceu.", "Logs na tela.", "Checando os logs."],
};

export const COMENTARIOS_CPU_ALTA = [
    "Tá quente aqui.",
    "CPU tá em chamas.",
    "Alguma coisa tá trabalhando pesado.",
    "Respira, processador.",
    "Tá pegando fogo.",
    "Isso tá pesado, hein.",
];

export const COMENTARIOS_RAM_ALTA = [
    "A memória tá cheia.",
    "Muita coisa aberta, hein?",
    "RAM quase estourando.",
    "Tá pesado de memória.",
    "Cheio de coisa rodando.",
];

export const COMENTARIOS_TARDE = [
    "Já é tarde, né?",
    "Tá na hora de descansar.",
    "Você tá acordado ainda?",
    "Já passou da hora de dormir.",
    "Amanhã tem mais.",
];

export const COMENTARIOS_ALMOCO = [
    "Tá na hora do almoço.",
    "Não esquece de comer.",
    "Bora almoçar?",
    "Pausa pro rango.",
];

export const COMENTARIOS_SEXTA = [
    "Sexta, hein.",
    "Sextou.",
    "Já é sexta.",
    "Sexta chegou. Respira.",
];

export const COMENTARIOS_SEGUNDA = [
    "Segunda de novo.",
    "Bora encarar a semana.",
    "Segundona.",
    "Vamos com calma hoje.",
];

export const COMENTARIOS_APOS_CLIQUE = [
    "Prontinho.",
    "Feito.",
    "Tá aberto.",
    "Fiz.",
    "Ok.",
    "Tá lá.",
];

// ============ helpers ============

export function sorteia<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function saudacaoPorHora(): string {
    const h = new Date().getHours();
    const faixa = h < 5 ? "madrugada" : h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
    return sorteia(SAUDACOES[faixa as keyof typeof SAUDACOES]);
}

export function todasFalas(): string[] {
    const flat = (obj: Record<string, string[]>) => Object.values(obj).flat();
    return [
        ...flat(SAUDACOES),
        ...flat(FALAS_MODO),
        ...flat(FALAS_ABERTURA),
        ...COMENTARIOS_CPU_ALTA,
        ...COMENTARIOS_RAM_ALTA,
        ...COMENTARIOS_TARDE,
        ...COMENTARIOS_ALMOCO,
        ...COMENTARIOS_SEXTA,
        ...COMENTARIOS_SEGUNDA,
        ...COMENTARIOS_APOS_CLIQUE,
    ];
}

export function comentarioContextual(info: {
    cpu: number;
    ram: number;
}): string | null {
    const h = new Date().getHours();
    const dia = new Date().getDay(); // 0=dom, 6=sab
    const rand = Math.random();

    // prioridade: madrugada > cpu alta > ram alta > almoço > sexta > segunda
    if ((h >= 23 || h < 5) && rand < 0.3) return sorteia(COMENTARIOS_TARDE);
    if (info.cpu >= 85 && rand < 0.5) return sorteia(COMENTARIOS_CPU_ALTA);
    if (info.ram >= 85 && rand < 0.4) return sorteia(COMENTARIOS_RAM_ALTA);
    if (h >= 12 && h <= 13 && rand < 0.15) return sorteia(COMENTARIOS_ALMOCO);
    if (dia === 5 && h >= 16 && rand < 0.15) return sorteia(COMENTARIOS_SEXTA);
    if (dia === 1 && h <= 10 && rand < 0.15) return sorteia(COMENTARIOS_SEGUNDA);

    return null;
}

// ============ SAUDAÇÃO POR TEMPO AUSENTE ============

export function saudacaoPorAusencia(msAusente: number): string {
    const min = msAusente / 60000;
    const horas = min / 60;
    const dias = horas / 24;

    if (msAusente === 0) return saudacaoPorHora();

    if (min < 5) {
        return sorteia([
            "Oi de novo.",
            "Voltei.",
            "Tô aqui.",
            "Opa.",
        ]);
    }
    if (min < 60) {
        return sorteia([
            "Oi de novo.",
            "De volta rápido, hein.",
            "Oi.",
        ]);
    }
    if (horas < 6) {
        return sorteia([
            "Oi, voltou.",
            "De volta.",
            "Oi.",
        ]);
    }
    if (horas < 24) {
        return sorteia([
            "Oi, faz um tempinho.",
            "De volta depois de um tempo.",
            "Oi. Tudo certo?",
        ]);
    }
    if (dias < 3) {
        return sorteia([
            "Oi! Faz um tempo.",
            "De volta depois de um dia.",
            "Oi. Bem-vindo de volta.",
        ]);
    }
    if (dias < 7) {
        return sorteia([
            "Oi! Faz uns dias.",
            "De volta depois de um tempo.",
            "Oi, quanto tempo.",
        ]);
    }
    return sorteia([
        "Oi, sumido.",
        "Faz um tempão.",
        "Bem-vindo de volta.",
    ]);
}

// ============ LEMBRETES ============

export function fraseLembrete(texto: string): string {
    const prefixos = [
        "Lembrete:",
        "Não esquece:",
        "Ei,",
        "Ó:",
    ];
    return `${sorteia(prefixos)} ${texto}`;
}

export function fraseTodosLembretes(qt: number): string {
    if (qt === 1) return "Você tem 1 lembrete.";
    return `Você tem ${qt} lembretes.`;
}

// ============ HELPERS DE FALA ============

export function falasModo(nome: string): string[] | null {
    const chave = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
    return FALAS_MODO[chave] ?? null;
}

export function falasAbertura(nome: string): string[] | null {
    const chave = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
    return FALAS_ABERTURA[chave] ?? null;
}