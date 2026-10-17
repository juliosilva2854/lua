import RenderLembretes from "./RenderLembretes";
import RenderADP from "./RenderADP";
import RenderGitHub from "./RenderGitHub";
import RenderWhatsApp from "./RenderWhatsApp";

type Item = {
    id: string;
    label: string;
    valor?: string | null;
    icone?: string | null;
};

type Secao = {
    titulo: string;
    tipo: string;
    itens: Item[];
};

type Props = {
    secao: Secao;
    integracaoId: string;
    onComando: (integracaoId: string, comandoId: string) => void;
    refreshKey?: number;
};

export default function RenderSecao({
    secao,
    integracaoId,
    onComando,
    refreshKey = 0,
}: Props) {
    if (secao.tipo === "status") {
        return (
            <>
                <h3>{secao.titulo}</h3>
                {secao.itens.map((i) => (
                    <div className="row" key={i.id}>
                        <span>{i.label}</span>
                        <span>{i.valor ?? "—"}</span>
                    </div>
                ))}
            </>
        );
    }

    if (secao.tipo === "botoes") {
        const cols = secao.itens.length === 3 ? "3" : "2";
        return (
            <>
                <h3>{secao.titulo}</h3>
                <div className={`grid grid-${cols}`}>
                    {secao.itens.map((i) => (
                        <button key={i.id} onClick={() => onComando(integracaoId, i.id)}>
                            {i.icone && <span className="btn-icone">{i.icone}</span>}
                            {i.label}
                        </button>
                    ))}
                </div>
            </>
        );
    }

    if (secao.tipo === "lembretes") {
        return <RenderLembretes refreshKey={refreshKey} />;
    }

    if (secao.tipo === "adp") {
        return <RenderADP />;
    }

    if (secao.tipo === "github") {
        return <RenderGitHub />;
    }

    if (secao.tipo === "whatsapp") {
        return <RenderWhatsApp />;
    }

    return null;
}