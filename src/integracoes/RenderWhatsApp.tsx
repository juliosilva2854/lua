import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = {
    conectado: boolean;
    status: string;
    numero: string | null;
    nome: string | null;
};

type Config = {
    url: string;
    api_key: string;
};

const GRUPO_TESTE = "120363408588682278@g.us";

export default function RenderWhatsApp() {
    const [status, setStatus] = useState<Status | null>(null);
    const [config, setConfig] = useState<Config | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [testandoIA, setTestandoIA] = useState(false);

    const [mensagem, setMensagem] = useState("");
    const [chatId, setChatId] = useState(GRUPO_TESTE);
    const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
    const [mostrarConfig, setMostrarConfig] = useState(false);
    const [erroStatus, setErroStatus] = useState<string | null>(null);

    async function carregar() {
        setCarregando(true);
        setErroStatus(null);
        try {
            const c = await invoke<Config>("whatsapp_config_get");
            setConfig(c);
            try {
                const s = await invoke<Status>("whatsapp_status");
                setStatus(s);
            } catch (e) {
                setStatus(null);
                setErroStatus("WAHA não respondeu. O Docker está rodando?");
            }
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    async function enviar() {
        if (!mensagem.trim() || enviando) return;
        setEnviando(true);
        setFeedback(null);
        try {
            await invoke("whatsapp_enviar_teste", { chatId, texto: mensagem });
            setFeedback({ tipo: "ok", texto: "Mensagem enviada ✅" });
            setMensagem("");
        } catch (e) {
            setFeedback({ tipo: "erro", texto: "Falha ao enviar. Verifique a conexão." });
        } finally {
            setEnviando(false);
        }
    }

    async function testarIA() {
        if (testandoIA) return;
        setTestandoIA(true);
        setFeedback(null);
        try {
            const res = await invoke<string>("testar_ia", { mensagem: "Lua, vou sair pra almoçar agora" });
            setFeedback({ tipo: "ok", texto: `IA entendeu: ${res}` });
        } catch (e) {
            // Tratamento de erro amigável para chaves 401
            if (String(e).includes("401") || String(e).includes("Unauthorized") || String(e).includes("UNAUTHENTICATED")) {
                setFeedback({ tipo: "erro", texto: "Erro 401: Chave do Gemini inválida ou modelo não liberado. Verifique o .env." });
            } else {
                setFeedback({ tipo: "erro", texto: String(e).substring(0, 100) + "..." });
            }
        } finally {
            setTestandoIA(false);
        }
    }

    async function salvarConfig() {
        if (!config) return;
        try {
            await invoke("whatsapp_config_set", {
                url: config.url,
                apiKey: config.api_key,
            });
            setFeedback({ tipo: "ok", texto: "Config salva" });
            setMostrarConfig(false);
            carregar();
        } catch (e) {
            setFeedback({ tipo: "erro", texto: "Erro ao salvar config." });
        }
    }

    const verde = "#25D366";
    const vermelho = "#ef4444";

    return (
        <div style={styles.wrap}>
            <div style={styles.header}>
                <span style={styles.titulo}>WhatsApp</span>
                <button style={styles.btnGhost} onClick={carregar} disabled={carregando}>
                    {carregando ? "..." : "↻ Atualizar"}
                </button>
            </div>

            {/* Status */}
            <div style={styles.card}>
                <div style={styles.cardRow}>
                    <span
                        style={{
                            ...styles.dot,
                            background: status?.conectado ? verde : vermelho,
                            boxShadow: status?.conectado ? `0 0 10px ${verde}80` : "none",
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={styles.statusLinha}>
                            {status?.conectado ? "Conectado ao WhatsApp" : "Desconectado"}
                        </div>
                        <div style={styles.statusSub}>
                            {status ? `Status: ${status.status}` : erroStatus || "Falha na comunicação"}
                        </div>
                    </div>
                </div>
                {status?.conectado && (
                    <div style={styles.meBox}>
                        {status.nome && <div style={styles.meNome}>{status.nome}</div>}
                        {status.numero && <div style={styles.meNumero}>{status.numero.replace("@c.us", "")}</div>}
                    </div>
                )}
            </div>

            {/* Enviar teste e IA */}
            <div style={styles.card}>
                <div style={styles.label}>Enviar mensagem de teste</div>
                <input
                    style={styles.input}
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="chatId (ex: 120363408588682278@g.us)"
                />
                <textarea
                    style={{ ...styles.input, height: 60, resize: "none" }}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Olá do Lua 👋"
                />

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                        style={{
                            ...styles.btnPrimario,
                            flex: 1,
                            opacity: enviando || !mensagem.trim() ? 0.5 : 1,
                        }}
                        onClick={enviar}
                        disabled={enviando || !mensagem.trim()}
                    >
                        {enviando ? "Enviando..." : "Enviar mensagem"}
                    </button>

                    <button
                        style={{
                            ...styles.btnPrimario,
                            flex: 1,
                            background: "linear-gradient(90deg, #4285F4, #9b72cb)",
                            color: "#fff",
                            opacity: testandoIA ? 0.5 : 1
                        }}
                        onClick={testarIA}
                        disabled={testandoIA}
                    >
                        {testandoIA ? "Pensando..." : "🧠 Testar IA"}
                    </button>
                </div>
            </div>

            {/* Config */}
            <div style={styles.card}>
                <button
                    style={styles.btnGhostFull}
                    onClick={() => setMostrarConfig((v) => !v)}
                >
                    {mostrarConfig ? "▾" : "▸"} Configuração do WAHA
                </button>
                {mostrarConfig && config && (
                    <div style={{ marginTop: 10 }}>
                        <div style={styles.label}>URL</div>
                        <input
                            style={styles.input}
                            value={config.url}
                            onChange={(e) => setConfig({ ...config, url: e.target.value })}
                        />
                        <div style={{ ...styles.label, marginTop: 8 }}>API Key</div>
                        <input
                            style={styles.input}
                            value={config.api_key}
                            onChange={(e) => setConfig({ ...config, api_key: e.target.value })}
                        />
                        <button
                            style={{ ...styles.btnPrimario, marginTop: 10 }}
                            onClick={salvarConfig}
                        >
                            Salvar
                        </button>
                    </div>
                )}
            </div>

            {feedback && (
                <div
                    style={{
                        ...styles.feedback,
                        background: feedback.tipo === "ok" ? "rgba(37, 211, 102, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        borderColor: feedback.tipo === "ok" ? verde : vermelho,
                        color: feedback.tipo === "ok" ? verde : vermelho,
                    }}
                >
                    {feedback.texto}
                </div>
            )}
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    wrap: { display: "flex", flexDirection: "column", gap: 12, padding: 4 },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    titulo: { fontSize: 16, fontWeight: 600, color: "#eaeaea" },
    btnGhost: { background: "transparent", border: "1px solid #333", color: "#888", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12 },
    btnGhostFull: { background: "transparent", border: "none", color: "#888", textAlign: "left", padding: 0, cursor: "pointer", fontSize: 13 },
    card: { background: "rgba(255,255,255,0.02)", border: "1px solid #262626", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
    cardRow: { display: "flex", alignItems: "center", gap: 10 },
    dot: { width: 10, height: 10, borderRadius: "50%", transition: "all 0.3s" },
    statusLinha: { fontSize: 14, fontWeight: 600, color: "#eaeaea" },
    statusSub: { fontSize: 11, color: "#666" },
    meBox: { marginTop: 6, paddingTop: 8, borderTop: "1px solid #262626" },
    meNome: { fontSize: 13, fontWeight: 600, color: "#eaeaea" },
    meNumero: { fontSize: 11, color: "#666" },
    label: { fontSize: 11, color: "#666" },
    input: { background: "#0a0a0a", border: "1px solid #262626", borderRadius: 6, padding: "8px 10px", color: "#eaeaea", fontSize: 13, outline: "none", fontFamily: "inherit", transition: "border-color 0.2s" },
    btnPrimario: { background: "#25D366", color: "#062813", border: "none", borderRadius: 6, padding: "9px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "opacity 0.2s" },
    feedback: { padding: "10px 12px", borderRadius: 8, border: "1px solid", fontSize: 12, fontWeight: 500 },
};