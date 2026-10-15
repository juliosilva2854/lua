import { useEffect, useRef } from "react";

type State =
    | "idle" | "atento" | "pensando" | "falando"
    | "alerta" | "critico" | "dormindo";

type Props = {
    state: State;
    size?: number;
};

const COLORS: Record<State, [number, number, number]> = {
    idle: [185, 167, 255],
    atento: [124, 200, 255],
    pensando: [255, 192, 122],
    falando: [126, 255, 176],
    alerta: [255, 160, 80],
    critico: [255, 90, 90],
    dormindo: [130, 130, 150],
};

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export default function Character({ state, size = 26 }: Props) {
    const ref = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef<State>(state);
    stateRef.current = state;

    const sizeRef = useRef(size);
    sizeRef.current = size;

    // cor atual interpolada
    const currentColor = useRef<[number, number, number]>([...COLORS.idle]);

    // posição do mouse relativa ao centro do canvas (-1 a 1)
    const mouseRef = useRef({ x: 0, y: 0 });

    // posição suavizada dos olhos (lerp)
    const olhosRef = useRef({ x: 0, y: 0 });

    // humor interno
    const humor = useRef({
        blinkTimer: 0,
        blinkPhase: 0,
        lookTimer: 0,
        lookX: 0,
        lookY: 0,
        tontoAte: 0,
        sustoAte: 0,
        cliques: [] as number[],
        apertou: false,
        montadoEm: 0,
    });

    // listener do mouse global — atualiza a ref que o draw lê
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const canvas = ref.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const dist = Math.hypot(dx, dy) || 1;
            // normaliza pra -1..1 com queda suave pela distância
            const fator = Math.min(1, 400 / dist);
            mouseRef.current = {
                x: (dx / dist) * fator,
                y: (dy / dist) * fator,
            };
        };
        window.addEventListener("mousemove", onMove);
        return () => window.removeEventListener("mousemove", onMove);
    }, []);

    // listener de clique pra fazer o personagem reagir
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;

        const onDown = () => {
            const agora = performance.now();
            const h = humor.current;
            h.sustoAte = agora + 300;

            // limpa cliques antigos (> 1s)
            h.cliques = h.cliques.filter((t) => agora - t < 1000);
            h.cliques.push(agora);

            // 3 cliques em 1s = tonto por 2s
            if (h.cliques.length >= 3) {
                h.tontoAte = agora + 2000;
                h.cliques = [];
            }
        };

        canvas.addEventListener("mousedown", onDown);
        return () => canvas.removeEventListener("mousedown", onDown);
    }, []);

    useEffect(() => {
        const canvas = ref.current!;
        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;

        const setup = () => {
            const s = sizeRef.current;
            canvas.width = s * dpr;
            canvas.height = s * dpr;
            canvas.style.width = `${s}px`;
            canvas.style.height = `${s}px`;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        };
        setup();

        humor.current.montadoEm = performance.now();
        let lastSize = sizeRef.current;
        let raf = 0;
        const start = performance.now();

        const draw = (now: number) => {
            if (sizeRef.current !== lastSize) {
                lastSize = sizeRef.current;
                setup();
            }

            const sizeNow = sizeRef.current;
            const t = (now - start) / 1000;
            ctx.clearRect(0, 0, sizeNow, sizeNow);

            const estadoAtual = stateRef.current;
            const target = COLORS[estadoAtual] ?? COLORS.idle;
            currentColor.current = [
                lerp(currentColor.current[0], target[0], 0.1),
                lerp(currentColor.current[1], target[1], 0.1),
                lerp(currentColor.current[2], target[2], 0.1),
            ];
            const [r, g, b] = currentColor.current.map(Math.round);
            const color = `rgb(${r}, ${g}, ${b})`;
            const colorSoft = `rgba(${r}, ${g}, ${b}, 0.35)`;

            const cx = sizeNow / 2;
            const cy = sizeNow / 2;

            const isPensando = estadoAtual === "pensando";
            const isCritico = estadoAtual === "critico";
            const isAlerta = estadoAtual === "alerta";
            const isFalando = estadoAtual === "falando";
            const isDormindo = estadoAtual === "dormindo";

            const h = humor.current;
            const tonto = now < h.tontoAte;
            const susto = now < h.sustoAte;
            const tempoMontado = (now - h.montadoEm) / 1000;
            const acenando = tempoMontado < 2 && !tonto && !susto;

            // ===== anel de pensando =====
            if (isPensando) {
                const rotation = (t * 2) % (Math.PI * 2);
                ctx.strokeStyle = colorSoft;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, sizeNow / 2 - 1.5, rotation, rotation + Math.PI * 0.9);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(
                    cx,
                    cy,
                    sizeNow / 2 - 1.5,
                    rotation + Math.PI,
                    rotation + Math.PI * 1.9
                );
                ctx.stroke();
            }

            // ===== anel pulsante critico =====
            if (isCritico) {
                const pulse = (Math.sin(t * 6) + 1) / 2;
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + pulse * 0.5})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, sizeNow / 2 - 2, 0, Math.PI * 2);
                ctx.stroke();
            }

            // ===== ondas de fala =====
            if (isFalando) {
                for (let i = 0; i < 3; i++) {
                    const wavePhase = (t * 3 + i * 0.4) % 1;
                    const radius = sizeNow / 2 - 2 + wavePhase * 4;
                    const alpha = (1 - wavePhase) * 0.4;
                    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // ===== tonto: bolinhas girando em volta =====
            if (tonto) {
                const spin = t * 6;
                for (let i = 0; i < 3; i++) {
                    const ang = spin + (i * Math.PI * 2) / 3;
                    const orbitR = sizeNow / 2 - 1;
                    const bx = cx + Math.cos(ang) * orbitR;
                    const by = cy + Math.sin(ang) * orbitR * 0.5;
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
                    ctx.beginPath();
                    ctx.arc(bx, by, sizeNow * 0.06, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // ===== glow =====
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sizeNow / 2);
            grad.addColorStop(0, colorSoft);
            grad.addColorStop(1, "transparent");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, sizeNow, sizeNow);

            // ===== shake (critico / susto / tonto) =====
            let shake = 0;
            if (isCritico) shake = Math.sin(t * 30) * 0.6;
            else if (isAlerta) shake = Math.sin(t * 20) * 0.3;
            if (susto) shake += Math.sin(t * 60) * 0.8;

            // ===== respiração =====
            const breatheSpeed = isCritico
                ? 6
                : isAlerta
                    ? 4
                    : isPensando || isFalando
                        ? 4
                        : isDormindo
                            ? 0.8
                            : 2;
            const breatheAmp = isDormindo ? 0.12 : 0.06;
            const breathe = 1 + Math.sin(t * breatheSpeed) * breatheAmp;

            // tonto faz o corpo "girar" levemente
            const radius = (sizeNow / 2 - sizeNow * 0.18) * breathe;

            // ===== corpo =====
            ctx.beginPath();
            if (isDormindo) {
                ctx.ellipse(cx + shake, cy, radius, radius * 0.85, 0, 0, Math.PI * 2);
            } else if (tonto) {
                // corpo levemente inclinado
                ctx.save();
                ctx.translate(cx + shake, cy);
                ctx.rotate(Math.sin(t * 8) * 0.15);
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.restore();
            } else {
                ctx.arc(cx + shake, cy, radius, 0, Math.PI * 2);
            }
            ctx.fillStyle = color;
            ctx.fill();

            // ===== piscar =====
            h.blinkTimer += 1 / 60;
            const blinkInterval = 3 + Math.sin(t * 0.3) * 1.5 + 2;
            let blink = 1;
            if (h.blinkTimer > blinkInterval) {
                h.blinkPhase += (1 / 60) * 8;
                if (h.blinkPhase < Math.PI) {
                    blink = Math.max(0.1, Math.cos(h.blinkPhase));
                } else {
                    h.blinkTimer = 0;
                    h.blinkPhase = 0;
                    blink = 1;
                }
            }
            if (isDormindo) blink = 0.1;

            // ===== olhos: prioridade — tonto > susto > pensando > mouse > aleatório =====
            let lookX = 0;
            let lookY = 0;

            if (tonto) {
                // olhos dão voltas
                lookX = Math.cos(t * 4) * sizeNow * 0.04;
                lookY = Math.sin(t * 4) * sizeNow * 0.03;
                blink = 0.4;
            } else if (susto) {
                lookX = 0;
                lookY = -sizeNow * 0.03;
            } else if (isPensando) {
                lookX = Math.sin(t * 3) * sizeNow * 0.03;
                lookY = Math.cos(t * 2.3) * sizeNow * 0.02;
            } else if (isFalando) {
                lookX = 0;
                lookY = 0;
            } else if (isCritico) {
                lookX = 0;
                lookY = -sizeNow * 0.02;
            } else if (isDormindo) {
                lookX = 0;
                lookY = 0;
            } else {
                // segue o mouse, suavizado
                const alvoX = mouseRef.current.x * sizeNow * 0.05;
                const alvoY = mouseRef.current.y * sizeNow * 0.04;
                olhosRef.current.x = lerp(olhosRef.current.x, alvoX, 0.15);
                olhosRef.current.y = lerp(olhosRef.current.y, alvoY, 0.15);
                lookX = olhosRef.current.x;
                lookY = olhosRef.current.y;

                // aceno: nos primeiros 2s, olhos descem e sobem
                if (acenando) {
                    const cycle = Math.sin(tempoMontado * Math.PI);
                    lookY += cycle * sizeNow * 0.05;
                }
            }

            // ===== olhos desenhados =====
            const eyeOffset = sizeNow * 0.115;
            const eyeR = sizeNow * 0.054;

            ctx.fillStyle = "#0a0a0a";
            ctx.beginPath();
            ctx.ellipse(
                cx - eyeOffset + lookX + shake,
                cy - sizeNow * 0.04 + lookY,
                eyeR,
                eyeR * blink,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(
                cx + eyeOffset + lookX + shake,
                cy - sizeNow * 0.04 + lookY,
                eyeR,
                eyeR * blink,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();

            // ===== boca quando fala =====
            if (isFalando) {
                const mouthOpen = (Math.sin(t * 12) + 1) / 2;
                ctx.fillStyle = "#0a0a0a";
                ctx.beginPath();
                ctx.ellipse(
                    cx + shake,
                    cy + sizeNow * 0.115,
                    sizeNow * 0.077,
                    sizeNow * 0.038 + mouthOpen * sizeNow * 0.077,
                    0,
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }

            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    return <canvas ref={ref} style={{ cursor: "pointer" }} />;
}