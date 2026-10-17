import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import Character from "./Character";
import Icone from "./Icone";
import RenderSecao from "./integracoes/RenderSecao";
import {
  falasModo,
  falasAbertura,
  saudacaoPorAusencia,
  todasFalas,
  comentarioContextual,
  fraseLembrete,
  fraseTodosLembretes,
  sorteia,
} from "./personalidade";

type ProcessoTop = { nome: string; cpu: number };

type SystemInfo = {
  cpu_usage: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
  disco_used_gb: number;
  disco_total_gb: number;
  disco_percent: number;
  uptime_min: number;
  hostname: string;
  os_nome: string;
  processos_top: ProcessoTop[];
};

type CharState =
  | "idle" | "atento" | "pensando" | "falando"
  | "alerta" | "critico" | "dormindo";

type Clima = { temp: number; code: number };

type Integracao = {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  ordem: number;
  secoes: Array<{
    titulo: string;
    tipo: string;
    itens: Array<{
      id: string;
      label: string;
      valor?: string | null;
      icone?: string | null;
    }>;
  }>;
};

type AdpStatus = {
  vivo: boolean;
  logado: boolean;
  estado: string;
  ocupado?: boolean;
  timer_almoco_min?: number;
};

type WhatsStatus = {
  conectado: boolean;
  status: string;
  numero: string | null;
  nome: string | null;
};

type Modo = "colapsada" | "home" | "secao";
type Modal = "chat" | "add" | "config" | null;

const CPU_ALERTA = 75;
const CPU_CRITICO = 92;
const RAM_ALERTA = 80;
const RAM_CRITICO = 92;
const DISCO_ALERTA = 85;
const DISCO_CRITICO = 95;

const SIZE_COLAPSADA = { w: 420, h: 40 };
const SIZE_HOME = { w: 780, h: 470 };

const SIZE_SECAO: Record<string, { w: number; h: number }> = {
  adp: { w: 580, h: 620 },
  sistemas: { w: 460, h: 300 },
  apps: { w: 460, h: 300 },
  lembretes: { w: 480, h: 380 },
  github: { w: 540, h: 620 },
  whatsapp: { w: 540, h: 620 },
  _default: { w: 500, h: 420 },
};

const TEMPO_DORMIR = 5 * 60 * 1000;
const ULTIMO_MODO_KEY = "lua.apps.ultimoModo";
const MUDO_KEY = "lua.mudo";
const ORDEM_CARDS: string[] = ["adp", "sistemas", "apps", "lembretes", "github", "whatsapp"];

function emojiClima(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

function faseDoDia(h: number): string {
  if (h < 6) return "madrugada";
  if (h < 12) return "manhã";
  if (h < 18) return "tarde";
  return "noite";
}

function saudacao(h: number): string {
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function uptimeBonito(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h${m}` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d${rh}h` : `${d}d`;
}

function App() {
  const [modo, setModo] = useState<Modo>("colapsada");
  const [secaoAtiva, setSecaoAtiva] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [hora, setHora] = useState(new Date());
  const [clima, setClima] = useState<Clima | null>(null);
  const [userState, setUserState] = useState<CharState | null>(null);
  const [charState, setCharState] = useState<CharState>("idle");
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [refreshLembretes, setRefreshLembretes] = useState(0);

  const [adpStatus, setAdpStatus] = useState<AdpStatus | null>(null);
  const [whatsStatus, setWhatsStatus] = useState<WhatsStatus | null>(null);
  const [qtdLembretes, setQtdLembretes] = useState(0);
  const [ultimoModo, setUltimoModo] = useState<string | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState<string>("");
  const [loginUsuario, setLoginUsuario] = useState<string>("");

  const [mudo, setMudo] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [novoLembrete, setNovoLembrete] = useState("");

  const reactionTimer = useRef<number | null>(null);
  const ultimaInteracao = useRef<number>(Date.now());
  const ultimoComentario = useRef<string>("");
  const jaSaudou = useRef(false);
  const jaAqueceu = useRef(false);
  const jaCarregouIntegracoes = useRef(false);

  const modoRef = useRef<Modo>("colapsada");
  modoRef.current = modo;

  useEffect(() => {
    if (jaCarregouIntegracoes.current) return;
    jaCarregouIntegracoes.current = true;
    invoke<Integracao[]>("listar_integracoes")
      .then(setIntegracoes)
      .catch((e) => console.error("listar_integracoes:", e));
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        setInfo(await invoke<SystemInfo>("get_system_info"));
      } catch (e) {
        console.error(e);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loc = await fetch("https://ipapi.co/json/").then((r) => r.json());
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`
        ).then((r) => r.json());
        setClima({
          temp: Math.round(w.current.temperature_2m),
          code: w.current.weather_code,
        });
      } catch (e) {
        console.error("clima falhou:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (jaAqueceu.current) return;
    jaAqueceu.current = true;
    invoke("preparar_falas", { frases: todasFalas() }).catch(console.error);
  }, []);

  useEffect(() => {
    try {
      setMudo(localStorage.getItem(MUDO_KEY) === "1");
    } catch {
      /* ignora */
    }
  }, []);

  const toggleMudo = () => {
    const novo = !mudo;
    setMudo(novo);
    try {
      localStorage.setItem(MUDO_KEY, novo ? "1" : "0");
    } catch {
      /* ignora */
    }
  };

  useEffect(() => {
    const tick = async () => {
      try {
        setAdpStatus(await invoke<AdpStatus>("adp_status"));
      } catch {
        setAdpStatus(null);
      }
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        setWhatsStatus(await invoke<WhatsStatus>("whatsapp_status"));
      } catch {
        setWhatsStatus(null);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        const l = await invoke<Array<{ id: string }>>("listar_lembretes");
        setQtdLembretes(l.length);
      } catch {
        setQtdLembretes(0);
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [refreshLembretes]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ULTIMO_MODO_KEY);
      if (raw) setUltimoModo(raw);
    } catch {
      /* ignora */
    }
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await invoke<{ logado: boolean }>("github_status");
        if (r.logado) {
          const p = await invoke<{ login: string; name: string | null }>(
            "github_perfil"
          );
          setNomeUsuario(p.name ?? p.login);
          setLoginUsuario(p.login);
        } else {
          setNomeUsuario("");
          setLoginUsuario("");
        }
      } catch {
        /* ignora */
      }
    };
    tick();
    const id = setInterval(tick, 60000);

    const onMudou = () => tick();
    window.addEventListener("github-mudou", onMudou);

    return () => {
      clearInterval(id);
      window.removeEventListener("github-mudou", onMudou);
    };
  }, []);

  useEffect(() => {
    let s = SIZE_COLAPSADA;
    if (modo === "home") s = SIZE_HOME;
    else if (modo === "secao") {
      s = SIZE_SECAO[secaoAtiva ?? "_default"] ?? SIZE_SECAO._default;
    }
    invoke("set_window_size", { width: s.w, height: s.h });
  }, [modo, secaoAtiva]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal) {
        setModal(null);
        return;
      }
      const m = modoRef.current;
      if (m === "secao") navegar("home", null);
      else if (m === "home") navegar("colapsada", null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  useEffect(() => {
    const checar = async () => {
      try {
        const vencidos = await invoke<Array<{ id: string; texto: string }>>(
          "lembretes_vencidos"
        );
        for (const l of vencidos) await falar(fraseLembrete(l.texto));
        if (vencidos.length > 0) setRefreshLembretes((v) => v + 1);
      } catch (e) {
        console.error("lembretes_vencidos:", e);
      }
    };
    const id = setInterval(checar, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mudo]);

  useEffect(() => {
    const id = setInterval(() => {
      if (userState || modo !== "colapsada" || !info || mudo) return;
      const frase = comentarioContextual({
        cpu: info.cpu_usage,
        ram: info.ram_percent,
      });
      if (frase && frase !== ultimoComentario.current) {
        ultimoComentario.current = frase;
        falar(frase);
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userState, modo, info, mudo]);

  useEffect(() => {
    const id = setInterval(() => {
      const parado = Date.now() - ultimaInteracao.current;
      if (parado > TEMPO_DORMIR && modo === "colapsada" && !userState) {
        setCharState("dormindo");
      }
    }, 10000);
    return () => clearInterval(id);
  }, [modo, userState]);

  useEffect(() => {
    if (userState) {
      setCharState(userState);
      return;
    }
    if (info) {
      if (info.cpu_usage >= CPU_CRITICO || info.ram_percent >= RAM_CRITICO) {
        setCharState("critico");
        return;
      }
      if (info.cpu_usage >= CPU_ALERTA || info.ram_percent >= RAM_ALERTA) {
        setCharState("alerta");
        return;
      }
    }
    const parado = Date.now() - ultimaInteracao.current;
    if (parado > TEMPO_DORMIR && modo === "colapsada") {
      setCharState("dormindo");
      return;
    }
    setCharState(modo === "colapsada" ? "idle" : "atento");
  }, [userState, info, modo]);

  const registrarInteracao = () => {
    ultimaInteracao.current = Date.now();
  };

  const pensarPor = (ms: number) => {
    setUserState("pensando");
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setUserState(null), ms);
  };

  const falar = async (texto: string) => {
    if (mudo) return;
    setUserState("falando");
    invoke("registrar_fala", { texto }).catch(() => { });
    try {
      await invoke("falar", { texto });
    } catch (e) {
      console.error("Falha ao falar:", e);
    } finally {
      setUserState(null);
    }
  };

  const executarComando = async (integracaoId: string, comandoId: string) => {
    registrarInteracao();

    if (integracaoId === "apps") {
      const falas = falasModo(comandoId);
      if (falas) falar(sorteia(falas)).catch(() => { });
      const nomeBonito =
        comandoId.charAt(0).toUpperCase() + comandoId.slice(1);
      setUltimoModo(nomeBonito);
      try {
        localStorage.setItem(ULTIMO_MODO_KEY, nomeBonito);
      } catch {
        /* ignora */
      }
    } else if (integracaoId === "sistemas") {
      const falas = falasAbertura(comandoId);
      if (falas) falar(sorteia(falas));
    }

    pensarPor(700);

    try {
      await invoke("executar_comando", {
        integracao: integracaoId,
        comando: comandoId,
        args: {},
      });
    } catch (e) {
      console.error("executar_comando:", e);
    }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (jaSaudou.current) return;
      jaSaudou.current = true;

      let ausente = 0;
      try {
        const anterior = await invoke<number>("registrar_abertura");
        ausente = anterior > 0 ? Date.now() - anterior : 0;
      } catch (e) {
        console.error("registrar_abertura:", e);
      }
      await falar(saudacaoPorAusencia(ausente));

      try {
        const retomada = await invoke<Array<{ id: string; texto: string }>>(
          "lembretes_retomada"
        );
        if (retomada.length > 0) {
          setTimeout(async () => {
            if (retomada.length === 1) {
              await falar(fraseLembrete(retomada[0].texto));
            } else {
              await falar(fraseTodosLembretes(retomada.length));
            }
            setRefreshLembretes((v) => v + 1);
          }, 2500);
        }
      } catch (e) {
        console.error("lembretes_retomada:", e);
      }
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navegar = (novoModo: Modo, novaSecao: string | null) => {
    registrarInteracao();
    if (novoModo === modo) return;
    setSaindo(true);
    setTimeout(() => {
      setModo(novoModo);
      setSecaoAtiva(novaSecao);
      setSaindo(false);
    }, 200);
  };

  const abrirHome = () => navegar("home", null);
  const abrirSecao = (id: string) => navegar("secao", id);
  const voltarHome = () => navegar("home", null);
  const colapsar = () => navegar("colapsada", null);

  const abrirChat = () => {
    registrarInteracao();
    setModal("chat");
  };
  const abrirAdd = () => {
    registrarInteracao();
    setModal("add");
  };
  const abrirConfig = () => {
    registrarInteracao();
    setModal("config");
  };

  const enviarChat = async () => {
    const texto = chatMsg.trim();
    if (!texto) return;
    setChatMsg("");
    setModal(null);
    await falar(texto);
  };

  const salvarLembrete = async () => {
    const texto = novoLembrete.trim();
    if (!texto) return;
    try {
      await invoke("adicionar_lembrete", { texto, quando: null });
      setNovoLembrete("");
      setModal(null);
      setRefreshLembretes((v) => v + 1);
    } catch (e) {
      console.error("adicionar_lembrete:", e);
    }
  };

  const horaStr = hora.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const integracoesOrdenadas = [...integracoes].sort((a, b) => {
    const ia = ORDEM_CARDS.indexOf(a.id);
    const ib = ORDEM_CARDS.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.ordem - b.ordem;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const integracaoAtiva = integracoes.find((i) => i.id === secaoAtiva);

  let labelColapsada = "Lua";
  if (info) {
    if (charState === "dormindo") labelColapsada = "💤";
    else if (charState === "critico") labelColapsada = "⚠ CRÍTICO";
    else if (charState === "alerta")
      labelColapsada = "⚠ " + info.cpu_usage.toFixed(0) + "%";
    else labelColapsada = `${info.cpu_usage.toFixed(0)}%`;
  }

  const statusHeader = (() => {
    if (charState === "critico")
      return { texto: "⚠ crítico", cor: "#ff8888" };
    if (charState === "alerta") return { texto: "⚠ atenção", cor: "#ffc07a" };
    if (info && info.disco_percent >= DISCO_CRITICO)
      return {
        texto: `💾 disco ${info.disco_percent.toFixed(0)}%`,
        cor: "#ff8888",
      };
    if (qtdLembretes > 0)
      return {
        texto: `📌 ${qtdLembretes} lembrete${qtdLembretes > 1 ? "s" : ""}`,
        cor: "#ffc07a",
      };
    const h = hora.getHours();
    return { texto: `Boa ${faseDoDia(h)}`, cor: "#7effb0" };
  })();

  const infoDoCard = (id: string): { sub: string; cor?: string } => {
    switch (id) {
      case "adp": {
        if (!adpStatus) return { sub: "offline", cor: "#666" };
        if (adpStatus.ocupado) return { sub: "ocupado", cor: "#ffc07a" };
        if (adpStatus.logado) return { sub: "✓ logado", cor: "#7effb0" };
        return { sub: "não logado", cor: "#888" };
      }
      case "sistemas":
        return { sub: "4 painéis" };
      case "apps":
        return ultimoModo
          ? { sub: `último: ${ultimoModo}` }
          : { sub: "3 modos" };
      case "lembretes":
        return qtdLembretes > 0
          ? {
            sub: `${qtdLembretes} ativo${qtdLembretes > 1 ? "s" : ""}`,
            cor: "#ffc07a",
          }
          : { sub: "nenhum" };
      case "github":
        return loginUsuario
          ? { sub: `@${loginUsuario}`, cor: "#7effb0" }
          : { sub: "não logado", cor: "#888" };
      case "whatsapp": {
        if (!whatsStatus) return { sub: "offline", cor: "#666" };
        if (whatsStatus.conectado) {
          const nomeExibir = whatsStatus.nome || whatsStatus.numero?.replace("@c.us", "") || "conectado";
          return { sub: nomeExibir, cor: "#25D366" };
        }
        return { sub: whatsStatus.status.toLowerCase(), cor: "#888" };
      }
      default:
        return { sub: "" };
    }
  };

  const pulso = (() => {
    if (charState === "critico")
      return {
        icone: "🔴",
        texto: "Sistema em estado crítico",
        cor: "#ff8888",
      };
    if (charState === "alerta")
      return {
        icone: "⚠️",
        texto: "Sistema pedindo atenção",
        cor: "#ffc07a",
      };
    if (adpStatus?.ocupado)
      return { icone: "⏳", texto: "Bater ponto em andamento", cor: "#7cc8ff" };
    if (qtdLembretes > 0)
      return {
        icone: "📌",
        texto: `${qtdLembretes} lembrete${qtdLembretes > 1 ? "s" : ""} pendente${qtdLembretes > 1 ? "s" : ""}`,
        cor: "#ffc07a",
      };
    const h = hora.getHours();
    if (h >= 5 && h < 12)
      return { icone: "☕", texto: "Bom dia, bora começar?", cor: "#7cc8ff" };
    if (h >= 12 && h < 14)
      return { icone: "🍽️", texto: "Hora do almoço", cor: "#ffd75c" };
    if (h >= 14 && h < 18)
      return { icone: "💼", texto: "Tarde produtiva", cor: "#7cc8ff" };
    if (h >= 18 && h < 23)
      return { icone: "🌙", texto: "Encerrando o dia", cor: "#b9a7ff" };
    return { icone: "🛌", texto: "Tá na hora de dormir", cor: "#888" };
  })();

  const saudacaoTexto = nomeUsuario
    ? `${saudacao(hora.getHours())}, ${nomeUsuario.split(" ")[0]}`
    : saudacao(hora.getHours());

  return (
    <div className={`notch modo-${modo}`}>
      {modo === "colapsada" && (
        <div className="notch-bar" onClick={abrirHome}>
          <Character state={charState} />
          <span className="label">{labelColapsada}</span>
          <div className="mini-info">
            {clima && (
              <span className="mini-item">
                <span className="mini-icon">{emojiClima(clima.code)}</span>
                <span className="mini-value">{clima.temp}°</span>
              </span>
            )}
            <span className="mini-item">
              <span className="mini-value">{horaStr}</span>
            </span>
          </div>
        </div>
      )}

      {modo !== "colapsada" && (
        <div className={`notch-panel ${saindo ? "saindo" : ""}`} key={modo}>
          <div className="np-header">
            <div className="np-header-esq">
              {modo === "secao" ? (
                <button className="np-voltar" onClick={voltarHome}>
                  ← {integracaoAtiva?.nome ?? "Voltar"}
                </button>
              ) : (
                <>
                  <button className="np-icone ativo" title="Início">
                    🏠
                  </button>
                  <button
                    className="np-icone"
                    onClick={abrirChat}
                    title="Conversar com a Lua"
                  >
                    💬
                  </button>
                  <button
                    className="np-icone"
                    onClick={abrirAdd}
                    title="Adicionar lembrete"
                  >
                    ➕
                  </button>
                </>
              )}
            </div>

            <div className="np-header-centro">
              {modo === "home" && (
                <>
                  <span
                    className="np-header-status"
                    style={{ color: statusHeader.cor }}
                  >
                    {statusHeader.texto}
                  </span>
                  {clima && (
                    <>
                      <span className="np-header-sep">·</span>
                      <span className="np-header-clima">
                        {emojiClima(clima.code)} {clima.temp}°C
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="np-header-dir">
              <span className="np-hora">{horaStr}</span>
              <button
                className="np-icone"
                onClick={abrirConfig}
                title="Configurações"
              >
                ⚙️
              </button>
              <button
                className={`np-icone ${mudo ? "mudo" : ""}`}
                onClick={toggleMudo}
                title={mudo ? "Ativar som" : "Silenciar"}
              >
                {mudo ? "🔇" : "🔊"}
              </button>
            </div>
          </div>

          <div className="np-conteudo">
            {modo === "home" && (
              <div className="np-home-layout">
                <div className="np-card-lua">
                  <div className="np-card-lua-glow" />

                  <div className="np-card-lua-topo">
                    <div className="np-card-lua-avatar">
                      <Character state={charState} size={54} />
                    </div>
                    <div className="np-card-lua-info">
                      <div className="np-card-lua-saudacao">
                        {saudacaoTexto}
                      </div>
                      <div className="np-card-lua-status">
                        {info ? info.hostname : "..."}
                      </div>
                    </div>
                  </div>

                  <div
                    className="np-card-lua-pulso"
                    style={{ color: pulso.cor }}
                  >
                    <span className="np-card-lua-pulso-icone">
                      {pulso.icone}
                    </span>
                    <span className="np-card-lua-pulso-texto">
                      {pulso.texto}
                    </span>
                  </div>

                  {info && (
                    <div className="np-card-lua-stats">
                      <div className="lua-stat">
                        <span className="lua-stat-label">CPU</span>
                        <span
                          className={`lua-stat-valor ${info.cpu_usage >= CPU_ALERTA ? "warn" : ""
                            }`}
                        >
                          {info.cpu_usage.toFixed(0)}%
                        </span>
                      </div>
                      <div className="lua-stat">
                        <span className="lua-stat-label">RAM</span>
                        <span
                          className={`lua-stat-valor ${info.ram_percent >= RAM_ALERTA ? "warn" : ""
                            }`}
                        >
                          {info.ram_percent.toFixed(0)}%
                        </span>
                      </div>
                      <div className="lua-stat">
                        <span className="lua-stat-label">DISCO</span>
                        <span
                          className={`lua-stat-valor ${info.disco_percent >= DISCO_ALERTA ? "warn" : ""
                            }`}
                        >
                          {info.disco_percent.toFixed(0)}%
                        </span>
                      </div>
                      <div className="lua-stat">
                        <span className="lua-stat-label">ON</span>
                        <span className="lua-stat-valor">
                          {uptimeBonito(info.uptime_min)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="np-card-lua-footer">
                    <span className="np-card-lua-login">
                      {loginUsuario ? `@${loginUsuario}` : "—"}
                    </span>
                    <span className="np-card-lua-hora">{horaStr}</span>
                  </div>
                </div>

                <div className="np-home-grid">
                  {integracoesOrdenadas.slice(0, 6).map((integ, i) => {
                    const infoCard = infoDoCard(integ.id);
                    return (
                      <button
                        key={integ.id}
                        className="np-card-mini"
                        style={{ animationDelay: `${i * 0.05 + 0.08}s` }}
                        onClick={() => abrirSecao(integ.id)}
                      >
                        <span className="np-card-mini-icone">
                          <Icone tipo={integ.id} size={30} />
                        </span>
                        <span className="np-card-mini-nome">
                          {integ.nome}
                        </span>
                        <span
                          className="np-card-mini-sub"
                          style={
                            infoCard.cor ? { color: infoCard.cor } : undefined
                          }
                        >
                          {infoCard.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {modo === "secao" && integracaoAtiva && (
              <div className="np-secao-conteudo">
                {integracaoAtiva.secoes.map((secao, i) => (
                  <RenderSecao
                    key={i}
                    secao={secao}
                    integracaoId={integracaoAtiva.id}
                    onComando={executarComando}
                    refreshKey={refreshLembretes}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="np-footer">
            <button className="np-fechar" onClick={colapsar}>
              Recolher · ESC
            </button>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal === "chat" && (
              <>
                <div className="modal-titulo">💬 Conversar com a Lua</div>
                <textarea
                  className="modal-input"
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  placeholder="Escreva o que a Lua deve falar…"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviarChat();
                    }
                  }}
                />
                <div className="modal-acoes">
                  <button
                    className="btn-cancelar"
                    onClick={() => setModal(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-confirmar"
                    onClick={enviarChat}
                    disabled={!chatMsg.trim()}
                  >
                    Falar
                  </button>
                </div>
              </>
            )}

            {modal === "add" && (
              <>
                <div className="modal-titulo">📌 Novo lembrete</div>
                <input
                  className="modal-input-single"
                  value={novoLembrete}
                  onChange={(e) => setNovoLembrete(e.target.value)}
                  placeholder="O que lembrar?"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      salvarLembrete();
                    }
                  }}
                />
                <div className="modal-acoes">
                  <button
                    className="btn-cancelar"
                    onClick={() => setModal(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn-confirmar"
                    onClick={salvarLembrete}
                    disabled={!novoLembrete.trim()}
                  >
                    Adicionar
                  </button>
                </div>
              </>
            )}

            {modal === "config" && (
              <>
                <div className="modal-titulo">⚙️ Configurações</div>
                <div className="modal-config">
                  <div className="config-row">
                    <span>Voz</span>
                    <span>{mudo ? "🔇 silenciada" : "🔊 ativa"}</span>
                  </div>
                  <div className="config-row">
                    <span>Timer almoço</span>
                    <span>{adpStatus?.timer_almoco_min ?? 55} min</span>
                  </div>
                  <div className="config-row">
                    <span>Host</span>
                    <span>{info?.hostname ?? "—"}</span>
                  </div>
                  <div className="config-row">
                    <span>OS</span>
                    <span>{info?.os_nome ?? "—"}</span>
                  </div>
                  <div className="config-row">
                    <span>GitHub</span>
                    <span>{loginUsuario ? `@${loginUsuario}` : "não logado"}</span>
                  </div>
                  <div className="config-row">
                    <span>WhatsApp</span>
                    <span>
                      {whatsStatus?.conectado
                        ? `✓ ${whatsStatus.nome ?? "conectado"}`
                        : whatsStatus?.status.toLowerCase() ?? "offline"}
                    </span>
                  </div>
                </div>

                {info && info.processos_top.length > 0 && (
                  <div className="modal-config">
                    <div className="config-row full">
                      <span>Top processos (CPU)</span>
                    </div>
                    {info.processos_top.map((p, i) => (
                      <div className="config-row" key={i}>
                        <span>{p.nome}</span>
                        <span>{p.cpu.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  className="btn-confirmar full"
                  onClick={async () => {
                    await falar("Testando voz da Lua.");
                  }}
                  disabled={mudo}
                >
                  🎙️ Testar voz
                </button>
                <div className="modal-acoes">
                  <button
                    className="btn-cancelar"
                    onClick={() => setModal(null)}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;