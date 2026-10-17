import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type GithubUser = {
    login: string;
    name: string | null;
    avatar_url: string;
};

type RepoInfo = {
    nome: string;
    descricao: string | null;
    url: string;
    estrelas: number;
    forks: number;
    branch_default: string;
    issues_abertas: number;
    linguagem: string | null;
    atualizado_em: string;
};

type CommitInfo = {
    sha: string;
    mensagem: string;
    autor: string;
    data: string;
};

type PrInfo = {
    numero: number;
    titulo: string;
    autor: string;
    url: string;
    draft: boolean;
    criado_em: string;
};

type IssueInfo = {
    numero: number;
    titulo: string;
    autor: string;
    url: string;
    labels: string[];
    criado_em: string;
};

// 🔧 EDITE AQUI: seu repositório
const REPO_OWNER = "juliosilva2854";
const REPO_NAME = "lua";

function tempoRelativo(iso: string): string {
    if (!iso) return "";
    const agora = Date.now();
    const data = new Date(iso).getTime();
    const diff = Math.floor((agora - data) / 1000);

    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}sem`;
    return `${Math.floor(diff / 2592000)}m`;
}

export default function RenderGitHub() {
    const [status, setStatus] = useState<string>("");
    const [user, setUser] = useState<GithubUser | null>(null);
    const [logando, setLogando] = useState(false);
    const [codigo, setCodigo] = useState<{
        user_code: string;
        verification_uri: string;
    } | null>(null);

    const [repo, setRepo] = useState<RepoInfo | null>(null);
    const [commits, setCommits] = useState<CommitInfo[]>([]);
    const [prs, setPrs] = useState<PrInfo[]>([]);
    const [issues, setIssues] = useState<IssueInfo[]>([]);
    const [carregandoDados, setCarregandoDados] = useState(false);

    const checar = async () => {
        try {
            const r = await invoke<{ logado: boolean }>("github_status");
            if (r.logado) {
                const p = await invoke<GithubUser>("github_perfil");
                setUser(p);
                setStatus(`✓ Conectado como ${p.login}`);
            } else {
                setUser(null);
                setStatus("Não conectado");
            }
        } catch (e) {
            setStatus(`✗ ${String(e)}`);
        }
    };

    const carregarRepo = async () => {
        setCarregandoDados(true);
        try {
            const [r, c, p, i] = await Promise.all([
                invoke<RepoInfo>("github_repo", {
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                }),
                invoke<CommitInfo[]>("github_commits", {
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                    limite: 4,
                }),
                invoke<PrInfo[]>("github_prs", {
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                }),
                invoke<IssueInfo[]>("github_issues", {
                    owner: REPO_OWNER,
                    repo: REPO_NAME,
                }),
            ]);
            setRepo(r);
            setCommits(c);
            setPrs(p);
            setIssues(i);
        } catch (e) {
            console.error("erro carregando repo:", e);
        } finally {
            setCarregandoDados(false);
        }
    };

    useEffect(() => {
        checar();
    }, []);

    useEffect(() => {
        if (user) carregarRepo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const login = async () => {
        setLogando(true);
        setCodigo(null);
        setStatus("Pedindo código ao GitHub…");
        try {
            const r = await invoke<{
                user_code: string;
                verification_uri: string;
            }>("github_iniciar_login");

            setCodigo({
                user_code: r.user_code,
                verification_uri: r.verification_uri,
            });
            setStatus("Aguardando você autorizar no navegador…");

            try {
                await invoke("open_external", { url: r.verification_uri });
            } catch {
                /* ignora */
            }

            await invoke("github_aguardar_login");
            await checar();
            window.dispatchEvent(new Event("github-mudou"));
        } catch (e) {
            setStatus(`✗ ${String(e)}`);
        } finally {
            setLogando(false);
            setCodigo(null);
        }
    };

    const sair = async () => {
        try {
            await invoke("github_sair");
            setUser(null);
            setStatus("Desconectado");
            setRepo(null);
            setCommits([]);
            setPrs([]);
            setIssues([]);
            window.dispatchEvent(new Event("github-mudou"));
        } catch (e) {
            setStatus(`✗ ${String(e)}`);
        }
    };

    const abrirUrl = (url: string) => {
        console.log("abrir:", url);
        invoke("open_external", { url })
            .then(() => console.log("abriu"))
            .catch((e) => console.error("erro abrir:", e));
    };

    // ============ NÃO LOGADO ============
    if (!user) {
        return (
            <div className="github-wrap">
                <div className="github-status-row">
                    <span className="github-status-msg">{status || "—"}</span>
                </div>

                {codigo && (
                    <div className="github-codigo">
                        <div className="github-codigo-titulo">
                            Cole este código no navegador
                        </div>
                        <div className="github-codigo-valor">{codigo.user_code}</div>
                        <div className="github-codigo-sub">
                            Cole exatamente como aparece acima, incluindo o traço
                        </div>
                    </div>
                )}

                <button
                    className="github-acao primario"
                    onClick={login}
                    disabled={logando}
                >
                    {logando ? "Aguardando autorização…" : "🔑 Conectar ao GitHub"}
                </button>

                {!logando && (
                    <div className="linha-vazia">
                        Conecte sua conta GitHub pra ver PRs, issues e commits na Lua.
                    </div>
                )}
            </div>
        );
    }

    // ============ LOGADO ============
    return (
        <div className="github-wrap">
            {/* header: avatar + nome + sair */}
            <div className="gh-header">
                <img className="gh-avatar" src={user.avatar_url} alt={user.login} />
                <div className="gh-header-info">
                    <div className="gh-header-nome">{user.name ?? user.login}</div>
                    <div className="gh-header-login">@{user.login}</div>
                </div>
                <div className="gh-header-acoes">
                    <button
                        className="gh-icon-btn"
                        onClick={carregarRepo}
                        disabled={carregandoDados}
                        title="Recarregar"
                    >
                        ↻
                    </button>
                    <button className="gh-icon-btn sair" onClick={sair} title="Desconectar">
                        ✖
                    </button>
                </div>
            </div>

            {/* card do repo */}
            {repo && (
                <div className="gh-repo" onClick={() => abrirUrl(repo.url)}>
                    <div className="gh-repo-top">
                        <span className="gh-repo-nome">{repo.nome}</span>
                        {repo.linguagem && (
                            <span className="gh-repo-lang">{repo.linguagem}</span>
                        )}
                    </div>
                    {repo.descricao && (
                        <div className="gh-repo-desc">{repo.descricao}</div>
                    )}
                    <div className="gh-repo-meta">
                        <span className="gh-repo-stat">⭐ {repo.estrelas}</span>
                        <span className="gh-repo-stat">🍴 {repo.forks}</span>
                        <span className="gh-repo-stat">🌿 {repo.branch_default}</span>
                        <span className="gh-repo-stat">❗ {repo.issues_abertas}</span>
                    </div>
                </div>
            )}

            {/* commits */}
            {commits.length > 0 && (
                <div className="gh-secao">
                    <div className="gh-secao-titulo">Últimos commits</div>
                    <div className="gh-lista">
                        {commits.map((c) => (
                            <div className="gh-commit" key={c.sha}>
                                <span className="gh-commit-sha">{c.sha}</span>
                                <span className="gh-commit-msg">{c.mensagem}</span>
                                <span className="gh-commit-tempo">
                                    {tempoRelativo(c.data)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PRs */}
            {prs.length > 0 && (
                <div className="gh-secao">
                    <div className="gh-secao-titulo">
                        Pull requests abertos ({prs.length})
                    </div>
                    <div className="gh-lista">
                        {prs.map((p) => (
                            <div
                                className="gh-item"
                                key={p.numero}
                                onClick={() => abrirUrl(p.url)}
                            >
                                <span className="gh-item-num">#{p.numero}</span>
                                <span className="gh-item-titulo">{p.titulo}</span>
                                {p.draft && <span className="gh-item-badge">rascunho</span>}
                                <span className="gh-item-tempo">
                                    {tempoRelativo(p.criado_em)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* issues */}
            {issues.length > 0 && (
                <div className="gh-secao">
                    <div className="gh-secao-titulo">
                        Issues abertas ({issues.length})
                    </div>
                    <div className="gh-lista">
                        {issues.map((i) => (
                            <div
                                className="gh-item"
                                key={i.numero}
                                onClick={() => abrirUrl(i.url)}
                            >
                                <span className="gh-item-num">#{i.numero}</span>
                                <span className="gh-item-titulo">{i.titulo}</span>
                                <span className="gh-item-tempo">
                                    {tempoRelativo(i.criado_em)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {repo && prs.length === 0 && issues.length === 0 && (
                <div className="gh-vazio">
                    Nada pendente. Repositório limpo. 🧘
                </div>
            )}
        </div>
    );
}