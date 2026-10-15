import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type StatusADP = {
    vivo: boolean;
    logado: boolean;
    estado: string;
    ocupado?: boolean;
    timer_almoco_min?: number;
};

type LoginResp = { ok: boolean; url?: string; titulo?: string; erro?: string };

type LinhaEspelho = {
    data: string;
    marcacoes: string[];
    horarios?: string[];
    resultado: string;
};

type DiaCalendario = { dia: number; tipo: string };

type EspelhoResp = {
    ok: boolean;
    linhas?: LinhaEspelho[];
    total_horas?: string;
    calendario?: DiaCalendario[];
    erro?: string;
};

type Checagem = {
    nome: string;
    ok: boolean;
    motivo?: string;
    [k: string]: unknown;
};

type ValidarResp = {
    ok: boolean;
    checagens: Checagem[];
    pode_bater?: boolean;
    hora?: string;
    erro?: string;
};

type BaterResp = {
    ok: boolean;
    dry_run?: boolean;
    contexto?: string;
    metodo?: string;
    hora_antes?: string;
    hora_depois?: string;
    mensagem?: string;
    estado?: unknown;
    erro?: string;
};

type ConfigResp = {
    janelas: {
        entrada: { inicio: string; fim: string };
        almoco: { inicio: string; fim: string };
        saida: { inicio: string; fim: string };
    };
    timer_almoco_min: number;
};

type TimerAlmoco = {
    inicio: number;
    duracao_min: number;
};

type ContextoPonto = "entrada" | "almoco" | "saida";
type EstadoDia = "nada" | "trabalhando" | "almoco" | "finalizado";

type Aviso = {
    icone: string;
    texto: string;
    cor: string;
    prioridade: number;
};

const STORAGE_KEY = "lua.adp.espelho";
const TIMER_KEY = "lua.adp.timer_almoco";

const LABEL_CONTEXTO: Record<ContextoPonto, { icone: string; nome: string }> = {
    entrada: { icone: "🌅", nome: "Entrada" },
    almoco: { icone: "🍽️", nome: "Almoço" },
    saida: { icone: "🌙", nome: "Saída" },
};

export default function RenderADP() {
    const [status, setStatus] = useState<StatusADP | null>(null);
    const [msg, setMsg] = useState<string>("");
    const [executando, setExecutando] = useState(false);
    const [espelho, setEspelho] = useState<EspelhoResp | null>(null);
    const [validacao, setValidacao] = useState<ValidarResp | null>(null);
    const [config, setConfig] = useState<ConfigResp | null>(null);
    const [timerAlmoco, setTimerAlmoco] = useState<TimerAlmoco | null>(null);
    const [agora, setAgora] = useState(Date.now());
    const [validacaoAberta, setValidacaoAberta] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setEspelho(JSON.parse(raw));
            const rawT = localStorage.getItem(TIMER_KEY);
            if (rawT) setTimerAlmoco(JSON.parse(rawT));
        } catch {
            /* ignora */
        }
    }, []);

    useEffect(() => {
        if (!espelho) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(espelho));
        } catch {
            /* ignora */
        }
    }, [espelho]);

    useEffect(() => {
        try {
            if (timerAlmoco) {
                localStorage.setItem(TIMER_KEY, JSON.stringify(timerAlmoco));
            } else {
                localStorage.removeItem(TIMER_KEY);
            }
        } catch {
            /* ignora */
        }
    }, [timerAlmoco]);

    useEffect(() => {
        const id = setInterval(() => setAgora(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!timerAlmoco) return;
        const fim = timerAlmoco.inicio + timerAlmoco.duracao_min * 60 * 1000;
        if (agora >= fim && agora < fim + 2000) {
            invoke("falar", {
                texto: "Já deu o tempo do almoço. Hora de voltar.",
            }).catch(() => { });
        }
    }, [agora, timerAlmoco]);

    const carregarConfig = async () => {
        try {
            setConfig(await invoke<ConfigResp>("adp_config"));
        } catch (e) {
            console.warn("adp_config:", e);
        }
    };

    const checar = async () => {
        try {
            const s = await invoke<StatusADP>("adp_status");
            setStatus(s);
            if (!executando) setMsg(s.logado ? "✓ Logado" : "Não logado");
        } catch {
            setStatus(null);
            if (!executando) setMsg("Sidecar offline");
        }
    };

    useEffect(() => {
        carregarConfig();
        checar();
        const id = setInterval(() => {
            if (!executando) checar();
        }, 15000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [executando]);

    const login = async () => {
        setExecutando(true);
        setMsg("Abrindo navegador…");
        try {
            const r = await invoke<LoginResp>("adp_login");
            setMsg(r.ok ? `✓ Logado em ${r.titulo ?? "ADP"}` : `✗ ${r.erro}`);
            await checar();
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        } finally {
            setExecutando(false);
        }
    };

    const lerEspelho = async () => {
        setExecutando(true);
        setMsg("Lendo espelho…");
        try {
            const r = await invoke<EspelhoResp>("adp_espelho");
            if (r.ok) {
                setEspelho(r);
                setMsg(`✓ ${r.linhas?.length ?? 0} registros`);
            } else setMsg(`✗ ${r.erro}`);
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        } finally {
            setExecutando(false);
        }
    };

    const validarPonto = async () => {
        setExecutando(true);
        setMsg("Validando (sem clicar)…");
        try {
            const r = await invoke<ValidarResp>("adp_validar_ponto");
            setValidacao(r);
            setValidacaoAberta(true);
            setMsg(r.ok ? "✓ Validações passaram" : "✗ Bloqueado");
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        } finally {
            setExecutando(false);
        }
    };

    const simular = async (contexto: string) => {
        setExecutando(true);
        setMsg(`Simulando (${contexto})…`);
        try {
            const r = await invoke<BaterResp>("adp_bater_ponto", {
                dryRun: true,
                contexto,
            });
            setMsg(r.ok ? `✓ ${r.mensagem ?? "Simulação ok"}` : `✗ ${r.erro}`);
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        } finally {
            setExecutando(false);
        }
    };

    const baterPonto = async (contexto: ContextoPonto, label: string) => {
        const ok1 = window.confirm(
            `BATER PONTO (${label})?\n\nIsso vai registrar no ADP imediatamente.\n\nContinuar?`
        );
        if (!ok1) return;
        const ok2 = window.confirm("Confirma pela segunda vez?\n\nNão tem como desfazer.");
        if (!ok2) return;

        setExecutando(true);
        setMsg(`Batendo ponto (${label})…`);
        try {
            const r = await invoke<BaterResp>("adp_bater_ponto", {
                dryRun: false,
                contexto,
            });
            if (r.ok) {
                setMsg(`✓ ${label} às ${r.hora_depois ?? "?"}`);
                if (contexto === "almoco" && !timerAlmoco) {
                    const min = config?.timer_almoco_min ?? status?.timer_almoco_min ?? 55;
                    setTimerAlmoco({ inicio: Date.now(), duracao_min: min });
                }
                if (contexto === "almoco" && timerAlmoco) {
                    setTimerAlmoco(null);
                }
                try {
                    const e2 = await invoke<EspelhoResp>("adp_espelho");
                    if (e2.ok) setEspelho(e2);
                } catch {
                    /* ignora */
                }
            } else setMsg(`✗ ${r.erro}`);
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        } finally {
            setExecutando(false);
        }
    };

    const fechar = async () => {
        if (executando) return;
        try {
            await invoke("adp_fechar");
            setMsg("Navegador fechado");
            await checar();
        } catch (e) {
            setMsg(`✗ ${String(e)}`);
        }
    };

    const hoje = new Date();
    const padraoDia = `${String(hoje.getDate()).padStart(2, "0")}/${String(
        hoje.getMonth() + 1
    ).padStart(2, "0")}`;

    const linhaHoje = espelho?.linhas?.find((l) => l.data?.startsWith(padraoDia));

    const estadoHoje: EstadoDia = (() => {
        if (!linhaHoje) return "nada";
        const qtd = linhaHoje.horarios?.length ?? 0;
        if (qtd === 0) return "nada";
        if (qtd === 1) return "trabalhando";
        if (qtd === 2) return "almoco";
        if (qtd === 3) return "trabalhando";
        return "finalizado";
    })();

    const tempoDesdeUltima = (() => {
        if (!linhaHoje?.horarios || linhaHoje.horarios.length === 0) return null;
        const ultima = linhaHoje.horarios[linhaHoje.horarios.length - 1];
        const [h, m] = ultima.split(":").map(Number);
        const dataUltima = new Date();
        dataUltima.setHours(h, m, 0, 0);
        const diffMs = agora - dataUltima.getTime();
        if (diffMs < 0) return null;
        const min = Math.floor(diffMs / 60000);
        const hh = Math.floor(min / 60);
        const mm = min % 60;
        if (hh === 0) return `${mm}min`;
        if (mm === 0) return `${hh}h`;
        return `${hh}h ${mm}min`;
    })();

    const horaNum = hoje.getHours() * 60 + hoje.getMinutes();
    const dentroJanela = (janela: { inicio: string; fim: string } | undefined) => {
        if (!janela) return false;
        const [hi, mi] = janela.inicio.split(":").map(Number);
        const [hf, mf] = janela.fim.split(":").map(Number);
        const ini = hi * 60 + mi;
        const fim = hf * 60 + mf;
        return horaNum >= ini && horaNum <= fim;
    };

    const sugestao = (() => {
        if (!config) return null;
        const jaEntrou =
            estadoHoje === "trabalhando" ||
            estadoHoje === "almoco" ||
            estadoHoje === "finalizado";
        const jaSaiu = estadoHoje === "finalizado";

        if (!jaEntrou && dentroJanela(config.janelas.entrada)) {
            return { contexto: "entrada" as ContextoPonto, label: "Bater entrada" };
        }
        if (
            jaEntrou &&
            !jaSaiu &&
            estadoHoje === "trabalhando" &&
            dentroJanela(config.janelas.almoco)
        ) {
            return { contexto: "almoco" as ContextoPonto, label: "Iniciar almoço" };
        }
        if (estadoHoje === "almoco") {
            return { contexto: "almoco" as ContextoPonto, label: "Voltar do almoço" };
        }
        if (jaEntrou && !jaSaiu && dentroJanela(config.janelas.saida)) {
            return { contexto: "saida" as ContextoPonto, label: "Bater saída" };
        }
        return null;
    })();

    const calcularAvisos = (): Aviso[] => {
        const avisos: Aviso[] = [];
        if (!espelho?.ok) return avisos;

        if (espelho.calendario && espelho.calendario.length > 0) {
            const hojeDia = hoje.getDate();
            const proximos = espelho.calendario
                .filter((d) => d.dia >= hojeDia)
                .sort((a, b) => a.dia - b.dia);

            const proximo = proximos[0];
            if (proximo) {
                const diff = proximo.dia - hojeDia;
                const tipoNome = (() => {
                    switch (proximo.tipo) {
                        case "folga": return "folga";
                        case "feriado": return "feriado";
                        case "ferias": return "férias";
                        case "afastamento": return "afastamento";
                        default: return "dia especial";
                    }
                })();
                if (diff === 0) {
                    avisos.push({
                        icone: "🎉",
                        texto: `Hoje é ${tipoNome}!`,
                        cor: "#7effb0",
                        prioridade: 1,
                    });
                } else if (diff === 1) {
                    avisos.push({
                        icone: "📅",
                        texto: `Amanhã é ${tipoNome}`,
                        cor: "#7cc8ff",
                        prioridade: 2,
                    });
                } else if (diff <= 7) {
                    avisos.push({
                        icone: "📅",
                        texto: `${tipoNome} em ${diff} dias (dia ${proximo.dia})`,
                        cor: "#7cc8ff",
                        prioridade: 3,
                    });
                }
            }
        }

        if (espelho.total_horas) {
            const match = espelho.total_horas.match(/(\d+):(\d+)/);
            if (match) {
                const h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                const totalMin = h * 60 + m;
                if (totalMin < 0) {
                    avisos.push({
                        icone: "⚠️",
                        texto: `Saldo negativo: ${espelho.total_horas}`,
                        cor: "#ff8888",
                        prioridade: 1,
                    });
                } else if (totalMin > 0 && totalMin < 60) {
                    avisos.push({
                        icone: "💚",
                        texto: `Saldo positivo: ${espelho.total_horas}`,
                        cor: "#7effb0",
                        prioridade: 4,
                    });
                }
            }
        }

        if (espelho.linhas) {
            const inconsistentes = espelho.linhas.filter((l) =>
                l.resultado.toLowerCase().includes("inconsistente")
            );
            if (inconsistentes.length > 0) {
                const plural = inconsistentes.length > 1 ? "s" : "";
                avisos.push({
                    icone: "🚨",
                    texto: `${inconsistentes.length} inconsistência${plural} no espelho`,
                    cor: "#ff8888",
                    prioridade: 1,
                });
            }
        }

        if (
            estadoHoje === "nada" &&
            linhaHoje === undefined &&
            hoje.getDay() !== 0 &&
            hoje.getDay() !== 6
        ) {
            const hora = hoje.getHours();
            if (hora >= 9 && hora < 12) {
                avisos.push({
                    icone: "⏰",
                    texto: "Sem entrada registrada hoje",
                    cor: "#ffc07a",
                    prioridade: 2,
                });
            }
        }

        return avisos.sort((a, b) => a.prioridade - b.prioridade);
    };

    const avisos = calcularAvisos();

    const renderTimer = () => {
        if (!timerAlmoco) return null;
        const fim = timerAlmoco.inicio + timerAlmoco.duracao_min * 60 * 1000;
        const restanteMs = fim - agora;
        const atrasado = restanteMs < 0;
        const abs = Math.abs(restanteMs);
        const min = Math.floor(abs / 60000);
        const seg = Math.floor((abs % 60000) / 1000);

        return (
            <div className={`adp-timer ${atrasado ? "atrasado" : ""}`}>
                <div className="adp-timer-header">
                    <span className="adp-timer-icone">{atrasado ? "⚠️" : "🍽️"}</span>
                    <span className="adp-timer-label">
                        {atrasado ? "Almoço passou do tempo" : "Almoço em andamento"}
                    </span>
                </div>
                <div className="adp-timer-tempo">
                    {atrasado ? "+" : ""}
                    {String(min).padStart(2, "0")}:{String(seg).padStart(2, "0")}
                </div>
                <div className="adp-timer-sub">
                    {atrasado ? `passou ${min}min` : `de ${timerAlmoco.duracao_min} min`}
                </div>
            </div>
        );
    };

    const almocoEmAndamento = timerAlmoco !== null;

    return (
        <div className="adp-wrap">
            <div className="adp-status-row">
                <span className="adp-status-msg">{msg || "—"}</span>
                <button
                    className="adp-status-refresh"
                    onClick={checar}
                    disabled={executando}
                    title="Atualizar status"
                >
                    ↻
                </button>
            </div>

            <div className={`adp-agora estado-${estadoHoje}`}>
                <div className="adp-agora-label">Agora</div>
                <div className="adp-agora-principal">
                    {estadoHoje === "nada" && (
                        <>
                            <span className="adp-agora-icone">💤</span>
                            <div className="adp-agora-texto">
                                <div className="adp-agora-titulo">Fora do ponto</div>
                                <div className="adp-agora-sub">
                                    {sugestao
                                        ? `Próximo: ${LABEL_CONTEXTO[sugestao.contexto].nome.toLowerCase()}`
                                        : "Sem ação pendente"}
                                </div>
                            </div>
                        </>
                    )}
                    {estadoHoje === "trabalhando" && (
                        <>
                            <span className="adp-agora-icone">💼</span>
                            <div className="adp-agora-texto">
                                <div className="adp-agora-titulo">Trabalhando</div>
                                <div className="adp-agora-sub">
                                    {tempoDesdeUltima
                                        ? `desde ${tempoDesdeUltima} atrás`
                                        : "em jornada"}
                                </div>
                            </div>
                        </>
                    )}
                    {estadoHoje === "almoco" && (
                        <>
                            <span className="adp-agora-icone">🍽️</span>
                            <div className="adp-agora-texto">
                                <div className="adp-agora-titulo">Em almoço</div>
                                <div className="adp-agora-sub">
                                    {tempoDesdeUltima ? `há ${tempoDesdeUltima}` : "aproveite"}
                                </div>
                            </div>
                        </>
                    )}
                    {estadoHoje === "finalizado" && (
                        <>
                            <span className="adp-agora-icone">✅</span>
                            <div className="adp-agora-texto">
                                <div className="adp-agora-titulo">Dia finalizado</div>
                                <div className="adp-agora-sub">bom descanso</div>
                            </div>
                        </>
                    )}
                </div>

                {sugestao && (
                    <div className="adp-agora-sugestao">
                        <span className="adp-agora-seta">→</span>
                        {LABEL_CONTEXTO[sugestao.contexto].icone} {sugestao.label}
                    </div>
                )}
            </div>

            {renderTimer()}

            {avisos.length > 0 && (
                <div className="adp-avisos">
                    {avisos.map((a, i) => (
                        <div
                            className="adp-aviso"
                            key={i}
                            style={{ borderLeftColor: a.cor }}
                        >
                            <span className="adp-aviso-icone">{a.icone}</span>
                            <span className="adp-aviso-texto" style={{ color: a.cor }}>
                                {a.texto}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {linhaHoje && (
                <div className="adp-jornada">
                    <div className="adp-jornada-titulo">Jornada de hoje</div>
                    <div className="adp-jornada-itens">
                        {(() => {
                            const descricoes = [
                                { icone: "🌅", label: "Entrada" },
                                { icone: "🍽️", label: "Saída almoço" },
                                { icone: "↩️", label: "Volta almoço" },
                                { icone: "🌙", label: "Saída" },
                            ];
                            const horarios = linhaHoje.horarios ?? [];
                            return descricoes.map((d, i) => {
                                const feito = i < horarios.length;
                                const hora = feito ? horarios[i] : "—";
                                return (
                                    <div
                                        key={i}
                                        className={`adp-jornada-item ${feito ? "feito" : "pendente"}`}
                                    >
                                        <span className="adp-jornada-icone">{d.icone}</span>
                                        <div className="adp-jornada-info">
                                            <span className="adp-jornada-hora">{hora}</span>
                                            <span className="adp-jornada-label">{d.label}</span>
                                        </div>
                                        <span className="adp-jornada-check">
                                            {feito ? "✓" : "○"}
                                        </span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}

            {espelho?.ok && espelho.total_horas && (
                <div className="adp-saldo">
                    <div className="adp-saldo-top">
                        <span className="adp-saldo-label">Saldo do mês</span>
                        <span className="adp-saldo-valor">{espelho.total_horas}</span>
                    </div>
                    <div className="adp-saldo-barra">
                        <div
                            className="adp-saldo-preenchido"
                            style={{
                                width: `${Math.min(
                                    100,
                                    Math.max(
                                        0,
                                        50 +
                                        (parseFloat(espelho.total_horas.replace(" h", "")) || 0) *
                                        5
                                    )
                                )}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            <div className="adp-secao-titulo">Ações</div>
            <div className="adp-acoes">
                <button onClick={login} disabled={executando} className="adp-acao">
                    🔑 Login
                </button>
                <button onClick={lerEspelho} disabled={executando} className="adp-acao">
                    📊 Espelho
                </button>
                <button
                    onClick={validarPonto}
                    disabled={executando}
                    className="adp-acao validar"
                >
                    ✓ Validar
                </button>
                <button onClick={fechar} disabled={executando} className="adp-acao">
                    ✖ Fechar
                </button>
            </div>

            <div className="adp-secao-titulo">Bater ponto</div>
            <div className="adp-botoes-ponto">
                <button
                    onClick={() => baterPonto("entrada", "Entrada")}
                    disabled={executando || almocoEmAndamento}
                    className="btn-ponto entrada"
                >
                    🌅 Entrada
                </button>

                {!almocoEmAndamento ? (
                    <button
                        onClick={() => baterPonto("almoco", "Início almoço")}
                        disabled={executando}
                        className="btn-ponto almoco"
                    >
                        🍽️ Iniciar almoço
                    </button>
                ) : (
                    <button
                        onClick={() => baterPonto("almoco", "Volta do almoço")}
                        disabled={executando}
                        className="btn-ponto voltar-almoco"
                    >
                        ↩️ Voltar do almoço
                    </button>
                )}

                <button
                    onClick={() => baterPonto("saida", "Saída")}
                    disabled={executando || almocoEmAndamento}
                    className="btn-ponto saida"
                >
                    🌙 Saída
                </button>
            </div>

            <div className="adp-botoes-simular">
                <button
                    onClick={() => simular("entrada")}
                    disabled={executando}
                    className="btn-dryrun"
                >
                    🧪 entrada
                </button>
                <button
                    onClick={() => simular("almoco")}
                    disabled={executando}
                    className="btn-dryrun"
                >
                    🧪 almoço
                </button>
                <button
                    onClick={() => simular("saida")}
                    disabled={executando}
                    className="btn-dryrun"
                >
                    🧪 saída
                </button>
            </div>

            {validacao && (
                <div className="adp-validacao-wrap">
                    <button
                        className={`adp-validacao-toggle ${validacao.ok ? "ok" : "falhou"}`}
                        onClick={() => setValidacaoAberta((v) => !v)}
                    >
                        <span>{validacao.ok ? "✓" : "✗"} Validações</span>
                        <span className={`seta ${validacaoAberta ? "aberta" : ""}`}>▾</span>
                    </button>

                    {validacaoAberta && (
                        <div className="adp-validacao-body">
                            {validacao.checagens.map((c, i) => (
                                <div className="adp-validacao-item" key={i}>
                                    <span className={c.ok ? "icone-ok" : "icone-falhou"}>
                                        {c.ok ? "✓" : "✗"}
                                    </span>
                                    <span className="nome">{c.nome}</span>
                                    <span className="motivo">{c.motivo ?? "ok"}</span>
                                </div>
                            ))}
                            {validacao.hora && (
                                <div className="adp-validacao-hora">
                                    Verificado às {validacao.hora}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {!espelho && (
                <div className="linha-vazia">
                    Clique em <strong>Espelho</strong> pra carregar os dados.
                </div>
            )}
        </div>
    );
}