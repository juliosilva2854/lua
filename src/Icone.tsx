type Props = {
    tipo: "adp" | "sistemas" | "apps" | "lembretes" | string;
    size?: number;
    cor?: string;
    className?: string;
};

const CORES: Record<string, string> = {
    adp: "#7cc8ff",
    sistemas: "#7effb0",
    apps: "#b9a7ff",
    lembretes: "#ffc07a",
};

export default function Icone({ tipo, size = 32, cor, className }: Props) {
    const c = cor ?? CORES[tipo] ?? "#b9a7ff";
    const s = size;

    return (
        <svg
            width={s}
            height={s}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{
                filter: `drop-shadow(0 0 6px ${c}55)`,
            }}
        >
            {tipo === "adp" && <IconeADP c={c} />}
            {tipo === "sistemas" && <IconeSistemas c={c} />}
            {tipo === "apps" && <IconeApps c={c} />}
            {tipo === "lembretes" && <IconeLembretes c={c} />}
        </svg>
    );
}

function IconeADP({ c }: { c: string }) {
    return (
        <>
            <circle cx="16" cy="16" r="13" fill={c} fillOpacity="0.12" />
            <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" />
            <circle cx="16" cy="16" r="8" stroke={c} strokeWidth="1.8" />
            <path
                d="M16 11 V16 L19.5 18"
                stroke={c}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <circle cx="16" cy="4" r="1.5" fill={c} />
        </>
    );
}

function IconeSistemas({ c }: { c: string }) {
    return (
        <>
            <circle cx="16" cy="16" r="13" fill={c} fillOpacity="0.12" />
            <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill={c} fillOpacity="0.85" />
            <rect x="17" y="9" width="6" height="6" rx="1.5" fill={c} fillOpacity="0.5" />
            <rect x="9" y="17" width="6" height="6" rx="1.5" fill={c} fillOpacity="0.5" />
            <rect x="17" y="17" width="6" height="6" rx="1.5" fill={c} fillOpacity="0.85" />
        </>
    );
}

function IconeApps({ c }: { c: string }) {
    return (
        <>
            <circle cx="16" cy="16" r="13" fill={c} fillOpacity="0.12" />
            <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" />
            <path
                d="M16 8
           C 19 10, 21 14, 21 18
           L 18 19
           L 16 22
           L 14 19
           L 11 18
           C 11 14, 13 10, 16 8 Z"
                fill={c}
                fillOpacity="0.85"
                stroke={c}
                strokeWidth="1.2"
                strokeLinejoin="round"
            />
            <circle cx="16" cy="14" r="1.6" fill="#08080a" />
            <path
                d="M14 22 L16 26 L18 22"
                stroke={c}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
}

function IconeLembretes({ c }: { c: string }) {
    return (
        <>
            <circle cx="16" cy="16" r="13" fill={c} fillOpacity="0.12" />
            <circle cx="16" cy="16" r="13" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" />
            <path
                d="M11 20
           C 11 16, 12 12, 16 12
           C 20 12, 21 16, 21 20
           Z"
                fill={c}
                fillOpacity="0.85"
                stroke={c}
                strokeWidth="1.2"
                strokeLinejoin="round"
            />
            <circle cx="16" cy="10.5" r="1.3" fill={c} />
            <circle cx="16" cy="22" r="1.4" fill={c} />
        </>
    );
}