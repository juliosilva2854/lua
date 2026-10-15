from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout
from loguru import logger
from datetime import datetime, date, time as dtime
from .config import settings
from . import storage
import asyncio
import re

URL_HOME = "https://expert.cloud.brasil.adp.com/expert2/v5/"


def _parse_hhmm(s: str) -> dtime:
    h, m = s.split(":")
    return dtime(int(h), int(m))


class RPAEngine:
    def __init__(self):
        self._playwright = None
        self._browser = None
        self._context = None
        self._page: Page | None = None
        self._logado = False
        self._lock = asyncio.Lock()
        self._ocupado = False

    async def iniciar(self) -> None:
        if self._playwright:
            return
        logger.info("Iniciando Playwright (async)…")
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=settings.HEADLESS,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
            ],
        )
        self._context = await self._browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        self._page = await self._context.new_page()
        logger.info("Playwright pronto.")

    async def fechar(self) -> None:
        async with self._lock:
            try:
                if self._context:
                    await self._context.close()
                if self._browser:
                    await self._browser.close()
                if self._playwright:
                    await self._playwright.stop()
            except Exception as e:
                logger.warning(f"Erro ao fechar: {e}")
            finally:
                self._playwright = None
                self._browser = None
                self._context = None
                self._page = None
                self._logado = False
                logger.info("Playwright encerrado.")

    @property
    def logado(self) -> bool:
        return self._logado

    @property
    def ocupado(self) -> bool:
        return self._ocupado

    @property
    def page(self) -> Page:
        if not self._page:
            raise RuntimeError("RPA não iniciado.")
        return self._page

    async def _screenshot(self, nome: str) -> str | None:
        try:
            path = settings.LOGS_DIR / f"{nome}_{datetime.now():%Y%m%d_%H%M%S}.png"
            await self.page.screenshot(path=str(path), full_page=False)
            logger.info(f"Screenshot: {path}")
            return str(path)
        except Exception as e:
            logger.warning(f"Falha ao salvar screenshot: {e}")
            return None

    # ---------- login ----------
    async def login(self) -> dict:
        async with self._lock:
            self._ocupado = True
            storage.init_db()
            try:
                await self.iniciar()

                logger.info("Navegando para URL de login…")
                await self.page.goto(
                    settings.ADP_URL,
                    wait_until="domcontentloaded",
                    timeout=settings.TIMEOUT_PADRAO_MS,
                )

                logger.info("Preenchendo usuário…")
                await self.page.wait_for_selector("#login", timeout=15000)
                await self.page.fill("#login", settings.ADP_USUARIO)

                logger.info("Preenchendo senha…")
                await self.page.fill("#login-pw", settings.ADP_SENHA)

                logger.info("Clicando em Entrar…")
                await self.page.click("button[type='submit']")

                try:
                    await self.page.wait_for_load_state(
                        "networkidle", timeout=20000
                    )
                except PWTimeout:
                    logger.warning("networkidle timeout — seguindo…")

                url_atual = self.page.url
                titulo = await self.page.title()

                if "ipclogin" in url_atual or "loginform" in url_atual:
                    await self._screenshot("login_falhou")
                    self._logado = False
                    storage.registrar_acao("login", "falhou")
                    return {
                        "ok": False,
                        "erro": "Ainda na tela de login após submit",
                        "url": url_atual,
                    }

                self._logado = True
                await self._screenshot("login_ok")
                storage.registrar_acao("login", "ok")
                logger.success(f"Login OK. URL: {url_atual}")
                return {"ok": True, "url": url_atual, "titulo": titulo}

            except Exception as e:
                logger.exception("Erro no login")
                await self._screenshot("login_exception")
                self._logado = False
                storage.registrar_acao("login", f"erro: {e}")
                return {"ok": False, "erro": str(e)}
            finally:
                self._ocupado = False

    # ---------- navegação pro Ponto ----------
    async def _ir_para_ponto(self) -> None:
        logger.info("Navegando pra home do ADP…")
        await self.page.goto(
            URL_HOME,
            wait_until="domcontentloaded",
            timeout=settings.TIMEOUT_PADRAO_MS,
        )
        await asyncio.sleep(3.0)

        if "ipclogin" in self.page.url or "loginform" in self.page.url:
            raise RuntimeError("Sessão expirou — precisa logar de novo")

        logger.info("Procurando menu 'Ponto'…")
        candidatos = [
            '[data-testid*="ponto" i]',
            '[data-testid*="timesheet" i]',
            '[aria-label="Ponto"]',
            'a:has-text("Ponto")',
            'button:has-text("Ponto")',
            'li:has-text("Ponto")',
            '[role="menuitem"]:has-text("Ponto")',
            '[role="link"]:has-text("Ponto")',
            'nav >> text=Ponto',
            'text="Ponto"',
        ]

        clicado = False
        for tentativa in range(5):
            for sel in candidatos:
                try:
                    el = self.page.locator(sel).first
                    cnt = await el.count()
                    if cnt > 0:
                        try:
                            await el.scroll_into_view_if_needed(timeout=2000)
                        except Exception:
                            pass
                        await el.click(timeout=8000)
                        logger.info(f"Clique no menu via seletor: {sel}")
                        clicado = True
                        break
                except Exception as e:
                    logger.debug(f"Seletor {sel} falhou: {e}")
                    continue
            if clicado:
                break
            logger.warning(f"Tentativa {tentativa+1}: menu não encontrado, aguardando…")
            await asyncio.sleep(2.0)

        if not clicado:
            logger.warning("Menu não achado — tentando URL direta /timesheet")
            try:
                await self.page.goto(
                    "https://expert.cloud.brasil.adp.com/expert2/v5/timesheet",
                    wait_until="domcontentloaded",
                    timeout=20000,
                )
                await asyncio.sleep(2.0)
                if await self.page.locator(
                    '[data-testid="ctn_timesheet_table"]'
                ).count() > 0:
                    logger.info("URL direta funcionou")
                    clicado = True
            except Exception as e:
                logger.warning(f"URL direta falhou: {e}")

        if not clicado:
            await self._screenshot("menu_ponto_nao_encontrado")
            raise RuntimeError("Não consegui clicar no menu 'Ponto'")

        logger.info("Esperando tabela do espelho…")
        await self.page.wait_for_selector(
            '[data-testid="ctn_timesheet_table"]',
            timeout=25000,
        )

        logger.info("Esperando conteúdo real das linhas…")
        try:
            await self.page.wait_for_function(
                r"""
                () => {
                    const lis = document.querySelectorAll(
                        '[data-testid^="ctn_timesheet_list_item-"] li'
                    );
                    for (const li of lis) {
                        if ((li.textContent || '').trim().length > 15) {
                            return true;
                        }
                    }
                    return false;
                }
                """,
                timeout=20000,
            )
            logger.info("Conteúdo real carregado")
        except PWTimeout:
            logger.warning("Timeout esperando <li> — extraindo assim mesmo")

    # ---------- espelho ----------
    async def ler_espelho(self) -> dict:
        async with self._lock:
            if not self._logado:
                return {"ok": False, "erro": "precisa logar primeiro"}

            self._ocupado = True
            try:
                await self._ir_para_ponto()

                linhas = await self._extrair_linhas()
                total_horas = await self._extrair_total_horas()
                calendario = await self._extrair_calendario()

                storage.registrar_leitura("espelho", f"{len(linhas)} linhas")
                await self._screenshot("espelho_ok")
                logger.success(
                    f"Espelho: {len(linhas)} linhas | "
                    f"total={total_horas!r} | "
                    f"calendario={len(calendario)} dias"
                )

                return {
                    "ok": True,
                    "url": self.page.url,
                    "linhas": linhas,
                    "total_horas": total_horas,
                    "calendario": calendario,
                    "lido_em": datetime.now().isoformat(),
                }

            except PWTimeout as e:
                logger.error(f"Timeout: {e}")
                await self._screenshot("espelho_timeout")
                return {"ok": False, "erro": f"timeout: {e}"}
            except Exception as e:
                logger.exception("Erro ao ler espelho")
                await self._screenshot("espelho_exception")
                return {"ok": False, "erro": str(e)}
            finally:
                self._ocupado = False

    # ---------- validações ----------
    async def _validar_dia_util(self, calendario: list) -> dict:
        hoje = date.today()
        dia = hoje.day
        for d in calendario:
            if d.get("dia") == dia:
                tipo = d.get("tipo", "")
                if tipo in ("folga", "afastamento", "ferias", "falta"):
                    return {
                        "ok": False,
                        "motivo": f"Hoje é {tipo} no ADP",
                        "tipo_dia": tipo,
                    }
                return {"ok": True, "tipo_dia": tipo or "util"}
        return {"ok": True, "tipo_dia": "util"}

    async def _validar_ja_bateu(self, linhas: list) -> dict:
        hoje = date.today()
        padrao_dia = f"{hoje.day:02d}/{hoje.month:02d}"
        for l in linhas:
            data_str = l.get("data", "")
            if padrao_dia in data_str:
                marcacoes = l.get("marcacoes", [])
                horarios = l.get("horarios", [])
                if marcacoes or horarios:
                    return {
                        "ok": False,
                        "motivo": f"Já existe batida hoje ({data_str}): "
                        f"{len(marcacoes)} marcação(ões)",
                        "data": data_str,
                        "marcacoes": marcacoes,
                        "horarios": horarios,
                    }
                return {"ok": True, "motivo": "linha de hoje sem batida ainda"}
        return {
            "ok": True,
            "motivo": "hoje ainda não aparece no espelho",
        }

    async def _validar_horario(self, contexto: str = "geral") -> dict:
        agora = datetime.now()
        hora_atual = agora.time()

        janelas = {
            "entrada": (
                _parse_hhmm(settings.JANELA_ENTRADA_INICIO),
                _parse_hhmm(settings.JANELA_ENTRADA_FIM),
                "entrada",
            ),
            "almoco": (
                _parse_hhmm(settings.JANELA_ALMOCO_INICIO),
                _parse_hhmm(settings.JANELA_ALMOCO_FIM),
                "almoço",
            ),
            "saida": (
                _parse_hhmm(settings.JANELA_SAIDA_INICIO),
                _parse_hhmm(settings.JANELA_SAIDA_FIM),
                "saída",
            ),
        }

        if contexto in janelas:
            ini, fim, nome = janelas[contexto]
            if ini <= hora_atual <= fim:
                return {
                    "ok": True,
                    "janela": nome,
                    "hora": agora.strftime("%H:%M"),
                }
            return {
                "ok": False,
                "motivo": f"Fora da janela de {nome} "
                f"({ini.strftime('%H:%M')}–{fim.strftime('%H:%M')}). "
                f"Agora: {agora.strftime('%H:%M')}",
                "hora": agora.strftime("%H:%M"),
            }

        for ini, fim, nome in janelas.values():
            if ini <= hora_atual <= fim:
                return {
                    "ok": True,
                    "janela": nome,
                    "hora": agora.strftime("%H:%M"),
                }

        return {
            "ok": False,
            "motivo": f"Fora de qualquer janela válida ({agora.strftime('%H:%M')})",
            "hora": agora.strftime("%H:%M"),
        }

    # ============ _validar_botao COM RETRY ============
    async def _validar_botao(self) -> dict:
        """
        Valida o botão 'Bater Ponto' com retry — o sdf-button é web component
        e às vezes o shadow root demora pra hidratar.
        """
        seletor = 'sdf-button[data-testid="btn_punch_gadget-punch-in"]'

        # espera o host aparecer
        try:
            await self.page.wait_for_selector(
                seletor, state="attached", timeout=15000
            )
        except PWTimeout:
            return {"ok": False, "motivo": "Botão não apareceu em 15s"}

        # tenta validar o conteúdo interno até 3x
        ultimo_erro = None
        for tentativa in range(3):
            info = await self.page.evaluate(
                r"""
                () => {
                    const el = document.querySelector(
                        'sdf-button[data-testid="btn_punch_gadget-punch-in"]'
                    );
                    if (!el) return { ok: false, motivo: 'não encontrado' };
                    const r = el.getBoundingClientRect();
                    const cs = window.getComputedStyle(el);
                    const visivel = r.width > 0 && r.height > 0 &&
                                    cs.display !== 'none' &&
                                    cs.visibility !== 'hidden' &&
                                    Number(cs.opacity) > 0;
                    if (!visivel) return { ok: false, motivo: 'não visível' };

                    const shadow = el.shadowRoot;
                    if (!shadow) return { ok: false, motivo: 'sem shadowRoot' };

                    let interno = shadow.querySelector('[part="beta-btn"]');
                    let selUsado = '[part="beta-btn"]';
                    if (!interno) {
                        interno = shadow.querySelector('button');
                        selUsado = 'button';
                    }
                    if (!interno) {
                        return { ok: false, motivo: 'shadow root ainda vazio' };
                    }

                    if (interno.disabled ||
                        interno.getAttribute('aria-disabled') === 'true' ||
                        el.hasAttribute('disabled')) {
                        return { ok: false, motivo: 'disabled' };
                    }

                    const busy =
                        el.hasAttribute('busy') ||
                        el.getAttribute('busy') === 'true';
                    if (busy) {
                        return { ok: false, motivo: 'busy' };
                    }

                    return {
                        ok: true,
                        texto: (el.textContent || '').trim(),
                        seletorInterno: selUsado,
                        toggledPending:
                            el.hasAttribute('toggled-item-added-pending'),
                    };
                }
                """
            )

            if info.get("ok"):
                if tentativa > 0:
                    logger.info(
                        f"_validar_botao: OK na tentativa {tentativa+1}"
                    )
                return info

            ultimo_erro = info.get("motivo", "desconhecido")
            logger.debug(
                f"_validar_botao tentativa {tentativa+1}/3 falhou: {ultimo_erro}"
            )
            await asyncio.sleep(1.0)

        return {
            "ok": False,
            "motivo": f"3 tentativas falharam (último: {ultimo_erro})",
        }

    # ---------- validar ponto ----------
    async def validar_ponto(self) -> dict:
        async with self._lock:
            if not self._logado:
                return {
                    "ok": False,
                    "checagens": [
                        {"nome": "login", "ok": False, "motivo": "não logado"}
                    ],
                }

            self._ocupado = True
            try:
                logger.info("=" * 60)
                logger.info("VALIDAR PONTO (sem clicar)")
                logger.info("=" * 60)

                checagens = []

                logger.info("[1/5] Navegando pra home…")
                await self.page.goto(
                    URL_HOME,
                    wait_until="domcontentloaded",
                    timeout=settings.TIMEOUT_PADRAO_MS,
                )
                await asyncio.sleep(2.0)
                checagens.append({"nome": "navegação", "ok": True})

                logger.info("[2/5] Validando horário…")
                v_horario = await self._validar_horario("geral")
                checagens.append({"nome": "horário", **v_horario})
                logger.info(f"[2/5] {v_horario}")

                logger.info("[3/5] Validando botão…")
                v_botao = await self._validar_botao()
                checagens.append({"nome": "botão", **v_botao})
                logger.info(f"[3/5] {v_botao}")

                logger.info("[4/5] Lendo espelho…")
                await self._ir_para_ponto()
                linhas = await self._extrair_linhas()
                calendario = await self._extrair_calendario()

                v_dia = await self._validar_dia_util(calendario)
                checagens.append({"nome": "dia útil", **v_dia})
                logger.info(f"[4/5] dia útil: {v_dia}")

                v_dup = await self._validar_ja_bateu(linhas)
                checagens.append({"nome": "batida duplicada", **v_dup})
                logger.info(f"[4/5] duplicado: {v_dup}")

                logger.info("[5/5] Consolidando…")
                todas_ok = all(c.get("ok") for c in checagens)
                await self._screenshot("validar_ponto")

                logger.info(
                    f"Resultado: {'✓ PODE BATER' if todas_ok else '✗ BLOQUEADO'}"
                )
                for c in checagens:
                    emoji = "✓" if c.get("ok") else "✗"
                    logger.info(
                        f"  {emoji} {c['nome']}: {c.get('motivo', 'ok')}"
                    )

                return {
                    "ok": todas_ok,
                    "checagens": checagens,
                    "pode_bater": todas_ok,
                    "hora": datetime.now().strftime("%H:%M:%S"),
                }

            except Exception as e:
                logger.exception("Erro em validar_ponto")
                await self._screenshot("validar_ponto_exception")
                return {"ok": False, "checagens": [], "erro": str(e)}
            finally:
                self._ocupado = False

    # ---------- bater ponto ----------
    async def bater_ponto(
        self,
        dry_run: bool = False,
        contexto: str = "geral",
    ) -> dict:
        async with self._lock:
            if not self._logado:
                return {"ok": False, "erro": "precisa logar primeiro"}

            self._ocupado = True
            storage.init_db()
            try:
                modo = "DRY-RUN (não clica)" if dry_run else "REAL (clica)"
                logger.info("=" * 60)
                logger.info(f"BATER PONTO — modo {modo} | contexto={contexto}")
                logger.info("=" * 60)

                logger.info("[1/6] Navegando pra home…")
                await self.page.goto(
                    URL_HOME,
                    wait_until="domcontentloaded",
                    timeout=settings.TIMEOUT_PADRAO_MS,
                )

                logger.info("[1.5/6] Esperando botão ficar visível…")
                seletor = 'sdf-button[data-testid="btn_punch_gadget-punch-in"]'
                try:
                    await self.page.wait_for_selector(
                        seletor, state="visible", timeout=20000
                    )
                    logger.info("[1.5/6] ✓ Botão visível")
                except PWTimeout:
                    logger.error("[1.5/6] Botão não ficou visível em 20s")
                    await self._screenshot("bater_botao_nao_visivel")
                    return {
                        "ok": False,
                        "erro": "Botão não ficou visível em 20s",
                    }

                await asyncio.sleep(1.5)

                logger.info("[2/6] Validando botão…")
                v_botao = await self._validar_botao()
                logger.info(f"[2/6] {v_botao}")
                if not v_botao.get("ok"):
                    await self._screenshot("bater_validacao_falhou")
                    return {
                        "ok": False,
                        "erro": f"Botão não está pronto: {v_botao.get('motivo')}",
                        "validacao": v_botao,
                    }

                logger.info("[3/6] Validando horário…")
                v_horario = await self._validar_horario(contexto)
                logger.info(f"[3/6] {v_horario}")
                if not v_horario.get("ok") and not dry_run:
                    await self._screenshot("bater_horario_invalido")
                    return {
                        "ok": False,
                        "erro": f"Horário inválido: {v_horario.get('motivo')}",
                        "validacao": v_horario,
                    }

                logger.info("[4/6] Lendo espelho pra checar duplicidade…")
                await self._ir_para_ponto()
                linhas = await self._extrair_linhas()
                calendario = await self._extrair_calendario()

                v_dia = await self._validar_dia_util(calendario)
                v_dup = await self._validar_ja_bateu(linhas)

                logger.info(f"[4/6] dia útil: {v_dia}")
                logger.info(f"[4/6] duplicado: {v_dup}")

                if not v_dia.get("ok") and not dry_run:
                    return {
                        "ok": False,
                        "erro": f"Não é dia útil: {v_dia.get('motivo')}",
                        "validacao": v_dia,
                    }

                if not v_dup.get("ok") and not dry_run:
                    return {
                        "ok": False,
                        "erro": f"Já tem batida: {v_dup.get('motivo')}",
                        "validacao": v_dup,
                    }

                logger.info("[5/6] Voltando pra home…")
                await self.page.goto(
                    URL_HOME,
                    wait_until="domcontentloaded",
                    timeout=settings.TIMEOUT_PADRAO_MS,
                )

                try:
                    await self.page.wait_for_selector(
                        seletor, state="visible", timeout=20000
                    )
                except PWTimeout:
                    await self._screenshot("bater_botao_nao_visivel_2")
                    return {
                        "ok": False,
                        "erro": "Botão não ficou visível após voltar pra home",
                    }
                await asyncio.sleep(1.5)

                hora_antes = await self.page.evaluate(
                    "() => new Date().toLocaleTimeString('pt-BR')"
                )
                logger.info(f"[5/6] Hora antes: {hora_antes}")

                if dry_run:
                    logger.info("[5/6] DRY-RUN: não vou clicar")
                    await self._screenshot(f"bater_dryrun_{contexto}")
                    return {
                        "ok": True,
                        "dry_run": True,
                        "contexto": contexto,
                        "mensagem": "Todas as validações passaram. Nenhum clique feito.",
                        "hora": hora_antes,
                        "validacoes": {
                            "botao": v_botao,
                            "horario": v_horario,
                            "dia_util": v_dia,
                            "duplicado": v_dup,
                        },
                    }

                logger.info("[6/6] CLICANDO (modo REAL)…")

                sucesso = False
                metodo = ""

                try:
                    await self.page.locator(seletor).first.focus(timeout=3000)
                except Exception:
                    pass

                try:
                    interno = self.page.locator(
                        f'{seletor} >> [part="beta-btn"]'
                    )
                    if await interno.count() > 0:
                        await interno.first.click(timeout=5000)
                        sucesso = True
                        metodo = "locator_interno"
                except Exception as e:
                    logger.debug(f"Estratégia 1 falhou: {e}")

                if not sucesso:
                    try:
                        await self.page.locator(seletor).first.click(timeout=5000)
                        sucesso = True
                        metodo = "locator_host"
                    except Exception as e:
                        logger.debug(f"Estratégia 2 falhou: {e}")

                if not sucesso:
                    try:
                        r3 = await self.page.evaluate(
                            r"""
                            () => {
                                const host = document.querySelector(
                                    'sdf-button[data-testid="btn_punch_gadget-punch-in"]'
                                );
                                if (!host || !host.shadowRoot) return 'no shadow';
                                let el = host.shadowRoot.querySelector('[part="beta-btn"]')
                                       || host.shadowRoot.querySelector('button');
                                if (!el) return 'no inner';
                                el.focus && el.focus();
                                el.click();
                                el.dispatchEvent(new MouseEvent('click', {
                                    bubbles: true, cancelable: true, view: window
                                }));
                                return 'ok';
                            }
                            """
                        )
                        if r3 == "ok":
                            sucesso = True
                            metodo = "js_interno"
                    except Exception as e:
                        logger.debug(f"Estratégia 3 falhou: {e}")

                logger.info(f"[6/6] Sucesso={sucesso} método={metodo}")

                await asyncio.sleep(5.0)

                estado = await self.page.evaluate(
                    r"""
                    () => {
                        const out = { evidencias: [] };
                        const bodyTxt = document.body.textContent || '';

                        for (const sel of ['[role="alert"]', '[role="status"]',
                                           '.toast', 'sdf-toast',
                                           '[class*="toast" i]']) {
                            for (const el of document.querySelectorAll(sel)) {
                                const t = (el.textContent || '').trim();
                                if (t && t.length < 200) {
                                    out.evidencias.push({ tipo: 'toast', texto: t });
                                }
                            }
                        }

                        const m = bodyTxt.match(
                            /Última batida[^\d]{0,30}(\d{2}:\d{2})/i
                        );
                        if (m) out.evidencias.push({
                            tipo: 'ultima_batida', hora: m[1]
                        });

                        const errs = bodyTxt.match(
                            /(duplicad[oa]|já registrad[oa]|aguarde|erro|falh)/gi
                        );
                        if (errs) out.evidencias.push({
                            tipo: 'erro', matches: errs.slice(0, 5)
                        });

                        const oks = bodyTxt.match(
                            /(sucesso|registrad[oa]|batida registrada)/gi
                        );
                        if (oks) out.evidencias.push({
                            tipo: 'sucesso', matches: oks.slice(0, 5)
                        });

                        return out;
                    }
                    """
                )
                logger.info(f"Estado após clique: {estado}")

                hora_depois = await self.page.evaluate(
                    "() => new Date().toLocaleTimeString('pt-BR')"
                )

                await self._screenshot(f"bater_ponto_depois_{contexto}")
                storage.registrar_acao(
                    "bater_ponto",
                    f"ctx={contexto} metodo={metodo} sucesso={sucesso} "
                    f"hora={hora_antes}->{hora_depois}",
                )

                return {
                    "ok": sucesso,
                    "dry_run": False,
                    "contexto": contexto,
                    "metodo": metodo,
                    "hora_antes": hora_antes,
                    "hora_depois": hora_depois,
                    "estado": estado,
                    "erro": None if sucesso else "Nenhuma estratégia funcionou",
                }

            except Exception as e:
                logger.exception("Erro em bater_ponto")
                await self._screenshot(f"bater_ponto_exception_{contexto}")
                storage.registrar_acao("bater_ponto", f"erro: {e}")
                return {"ok": False, "erro": str(e)}
            finally:
                self._ocupado = False

    # ---- extração das linhas ----
    async def _extrair_linhas(self) -> list:
        try:
            resultado = await self.page.evaluate(
                r"""
                () => {
                    const rows = document.querySelectorAll(
                        '[data-testid^="ctn_timesheet_list_item-"]'
                    );
                    function extractRow(row) {
                        let data = '';
                        const tdDate = row.querySelector(
                            'td[data-testid*="_date"]'
                        );
                        if (tdDate) {
                            const raw = (tdDate.textContent || '')
                                .replace(/\s+/g, ' ').trim();
                            const m = raw.match(
                                /(\d{2}\/\d{2})\s*([A-Za-zÀ-ÿ]{3})?/
                            );
                            if (m) data = m[2]
                                ? `${m[1]} ${m[2].toUpperCase()}` : m[1];
                        }
                        if (!data) {
                            const raw = (row.textContent || '')
                                .replace(/\s+/g, ' ').trim();
                            const m = raw.match(
                                /(\d{2}\/\d{2})\s*([A-Za-zÀ-ÿ]{3})?/
                            );
                            if (m) data = m[2]
                                ? `${m[1]} ${m[2].toUpperCase()}` : m[1];
                        }
                        let marcacoes = [];
                        for (const li of row.querySelectorAll('li')) {
                            const t = (li.textContent || '')
                                .trim().replace(/\s+/g, ' ');
                            if (t.length > 10) marcacoes.push(t);
                        }
                        let horarios = [];
                        for (const s of row.querySelectorAll('svg text')) {
                            const t = (s.textContent || '').trim();
                            if (/^\d{1,2}:\d{2}$/.test(t)) {
                                if (!horarios.includes(t)) horarios.push(t);
                            }
                        }
                        let resultado = '';
                        const tds = row.querySelectorAll('td');
                        if (tds.length >= 3) {
                            resultado = (tds[2].textContent || '')
                                .trim().replace(/\s+/g, ' ');
                        }
                        return { data, marcacoes, horarios, resultado };
                    }
                    return Array.from(rows).map(extractRow);
                }
                """
            )
            if isinstance(resultado, list):
                logger.info(f"Extraídas {len(resultado)} linhas")
                return resultado
            return []
        except Exception as e:
            logger.warning(f"Falha na extração: {e}")
            return []

    async def _extrair_total_horas(self) -> str:
        try:
            els = await self.page.locator(
                '[data-testid*="balance_detailed"]'
            ).all()
            for el in els:
                try:
                    t = (await el.text_content(timeout=2000) or "").strip()
                except Exception:
                    continue
                m = re.match(r"^(\d{1,3}:\d{2})\s*h?$", t)
                if m:
                    logger.info(f"total_horas: {m.group(1)!r}")
                    return f"{m.group(1)} h"
            logger.warning("total_horas não encontrado")
            return ""
        except Exception as e:
            logger.warning(f"Falha ao ler total de horas: {e}")
            return ""

    async def _extrair_calendario(self) -> list:
        try:
            resultado = await self.page.evaluate(
                r"""
                () => {
                    const dias = document.querySelectorAll(
                        '[class*="react-datepicker__day--"]'
                    );
                    function parseCor(corStr) {
                        if (!corStr) return null;
                        const m = corStr.match(
                            /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/
                        );
                        if (!m) return null;
                        return [+m[1], +m[2], +m[3],
                                m[4] !== undefined ? +m[4] : 1];
                    }
                    function classificaCor(corStr) {
                        const c = parseCor(corStr);
                        if (!c) return null;
                        const [r, g, b, a] = c;
                        if (a === 0) return null;
                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        if (max - min < 20) return null;
                        if (g > r && g > b && g > 40) return 'folga';
                        if (r > 150 && g > 60 && g < 180 && b < 100)
                            return 'afastamento';
                        if (b > r && b > g && b > 100) return 'ferias';
                        return null;
                    }
                    function tipoDoDia(el) {
                        let cur = el;
                        for (let i = 0; i < 5 && cur; i++) {
                            const cs = window.getComputedStyle(cur);
                            for (const c of [
                                cs.backgroundColor,
                                cs.borderTopColor,
                                cs.borderLeftColor,
                            ]) {
                                const t = classificaCor(c);
                                if (t) return t;
                            }
                            cur = cur.parentElement;
                        }
                        return null;
                    }
                    const out = [];
                    for (const el of dias) {
                        const cls = el.className || '';
                        if (cls.includes('outside-month')) continue;
                        const t = (el.textContent || '').trim();
                        const m = t.match(/^(\d{1,2})$/);
                        if (!m) continue;
                        const dia = parseInt(m[1], 10);
                        const tipo = tipoDoDia(el);
                        out.push({ dia, tipo });
                    }
                    return out;
                }
                """
            )
            if not isinstance(resultado, list):
                return []
            marcados = [
                {"dia": d["dia"], "tipo": d["tipo"]}
                for d in resultado
                if d.get("tipo")
            ]
            logger.info(f"Calendário: {len(marcados)} marcados")
            return marcados
        except Exception as e:
            logger.warning(f"Falha ao ler calendário: {e}")
            return []


engine = RPAEngine()