import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Lembrete = {
    id: string;
    texto: string;
    quando: number | null;
    feito: boolean;
};

type Props = {
    refreshKey?: number;
    onMudou?: () => void;
};

export default function RenderLembretes({ refreshKey = 0, onMudou }: Props) {
    const [lembretes, setLembretes] = useState<Lembrete[]>([]);
    const [novoTexto, setNovoTexto] = useState("");
    const [comHora, setComHora] = useState(false);
    const [hora, setHora] = useState("");
    const [adicionando, setAdicionando] = useState(false);

    const recarregar = async () => {
        try {
            const l = await invoke<Lembrete[]>("listar_lembretes");
            setLembretes(l);
        } catch (e) {
            console.error("listar_lembretes:", e);
        }
    };

    useEffect(() => {
        recarregar();
    }, [refreshKey]);

    const adicionar = async () => {
        const texto = novoTexto.trim();
        if (!texto) return;

        let quando: number | null = null;
        if (comHora && hora) {
            const [h, m] = hora.split(":").map(Number);
            const d = new Date();
            d.setHours(h, m, 0, 0);
            if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
            quando = d.getTime();
        }

        try {
            await invoke("adicionar_lembrete", { texto, quando });
            setNovoTexto("");
            setHora("");
            setComHora(false);
            setAdicionando(false);
            await recarregar();
            onMudou?.();
        } catch (e) {
            console.error("adicionar_lembrete:", e);
        }
    };

    const marcarFeito = async (id: string) => {
        try {
            await invoke("marcar_lembrete_feito", { id });
            await recarregar();
            onMudou?.();
        } catch (e) {
            console.error("marcar_lembrete_feito:", e);
        }
    };

    const remover = async (id: string) => {
        try {
            await invoke("remover_lembrete", { id });
            await recarregar();
            onMudou?.();
        } catch (e) {
            console.error("remover_lembrete:", e);
        }
    };

    return (
        <>
            <div className="lembretes-header">
                <h3>Lembretes</h3>
                <button
                    className="icone-btn pequeno"
                    onClick={() => setAdicionando((v) => !v)}
                    title="Adicionar"
                >
                    {adicionando ? "✖" : "+"}
                </button>
            </div>

            {adicionando && (
                <div className="add-lembrete">
                    <input
                        className="input-nome"
                        value={novoTexto}
                        onChange={(e) => setNovoTexto(e.target.value)}
                        placeholder="O que lembrar?"
                        onKeyDown={(e) => e.key === "Enter" && adicionar()}
                        autoFocus
                    />
                    <label className="check-hora">
                        <input
                            type="checkbox"
                            checked={comHora}
                            onChange={(e) => setComHora(e.target.checked)}
                        />
                        Com hora
                    </label>
                    {comHora && (
                        <input
                            type="time"
                            className="input-hora"
                            value={hora}
                            onChange={(e) => setHora(e.target.value)}
                        />
                    )}
                    <button className="btn-salvar" onClick={adicionar}>
                        Adicionar
                    </button>
                </div>
            )}

            {lembretes.length === 0 && !adicionando && (
                <div className="linha-vazia">Nada por enquanto.</div>
            )}

            <div className="lista-lembretes">
                {lembretes.map((l) => (
                    <div className="item-lembrete" key={l.id}>
                        <button className="btn-check" onClick={() => marcarFeito(l.id)}>
                            ○
                        </button>
                        <div className="lembrete-texto">
                            <div>{l.texto}</div>
                            {l.quando !== null && (
                                <div className="lembrete-hora">
                                    {new Date(l.quando).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </div>
                            )}
                        </div>
                        <button
                            className="btn-remover-inline"
                            onClick={() => remover(l.id)}
                        >
                            ✖
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}