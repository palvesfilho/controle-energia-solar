"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Wifi,
  Wrench,
  ClipboardCheck,
  Activity,
  FileBarChart,
  FileText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Check,
  X,
  ArrowLeft,
  Printer,
  Rocket,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Etapa = {
  n: number;
  titulo: string;
  lead: string;
  itens: string[];
  Icon: React.ElementType;
  cls: string; // s1..s5 (define cor via CSS)
  cta?: boolean;
};

const ETAPAS: Etapa[] = [
  {
    n: 1,
    titulo: "Conexão Wi-Fi da usina",
    lead: "Conectamos o inversor da sua usina à internet para acompanhar a geração em tempo real.",
    itens: [
      "Configuração do inversor na rede Wi-Fi do local",
      "Cadastro da usina na plataforma de monitoramento",
      "Validação de que os dados de geração chegam corretamente",
    ],
    Icon: Wifi,
    cls: "s1",
  },
  {
    n: 2,
    titulo: "Visita técnica no local",
    lead: "Nossa equipe vai até a sua usina para conhecer a instalação de perto.",
    itens: [
      "Agendamento em data combinada com você",
      "Levantamento de módulos, inversores e cabeamento",
      "Registro fotográfico e checklist inicial do sistema",
    ],
    Icon: Wrench,
    cls: "s2",
  },
  {
    n: 3,
    titulo: "Inspeção completa",
    lead: "Análise detalhada de todo o sistema, garantindo segurança e máximo desempenho.",
    itens: [
      "Verificação de aterramento, proteções e conexões elétricas",
      "Análise de perdas, sombreamento e sujidade nos módulos",
      "Diagnóstico de falhas e recomendações de correção",
    ],
    Icon: ClipboardCheck,
    cls: "s3",
  },
  {
    n: 4,
    titulo: "Acompanhamento de performance",
    lead: "Passamos a monitorar a sua usina 24/7, acompanhando a geração e agindo em qualquer anomalia.",
    itens: [
      "Monitoramento contínuo da geração de energia",
      "Alertas automáticos de queda de produção ou falhas",
      "Atuação proativa sempre que algo sai do esperado",
    ],
    Icon: Activity,
    cls: "s4",
  },
  {
    n: 5,
    titulo: "Envio de relatórios mensais",
    lead: "Todo mês você recebe um relatório claro com a geração, a economia e o desempenho da sua usina.",
    itens: [
      "Relatório mensal de geração e economia",
      "Comparativo de desempenho e histórico da usina",
      "Transparência total sobre o retorno do investimento",
    ],
    Icon: FileBarChart,
    cls: "s5",
    cta: true,
  },
];

const BENEFICIOS = [
  {
    Icon: ShieldCheck,
    titulo: "Seguro da usina",
    texto: "Proteja seu investimento contra imprevistos com condição especial.",
    tag: "10% OFF na contratação",
  },
  {
    Icon: Wrench,
    titulo: "Manutenção completa",
    texto: "Limpeza, revisão e reparos para a usina render sempre no máximo.",
    tag: "10% OFF no serviço",
  },
  {
    Icon: TrendingUp,
    titulo: "Ajuste de envio de créditos",
    texto: "Distribuímos seus créditos da forma mais vantajosa entre as unidades.",
    tag: "Otimização incluída",
  },
];

// Relatório real de MAIO/2026 do cliente exemplo (OTHAVIO CECCIM MORALES),
// gerado on-the-fly pela rota de PDF do proprietário. Requer sessão admin
// (a página já é admin), então o iframe herda o cookie de sessão.
const RELATORIO_EXEMPLO = {
  cliente: "Othávio Ceccim Morales",
  mesLabel: "Maio / 2026",
  pdfUrl:
    "/api/brasil-solar/proprietarios/cmomq01bf1bsestgh127sgakj/relatorios/cmomq0ih61bshstgh3aj4u4in/pdf?ano=2026&mes=5",
};

type AdesaoForm = {
  nomeCompleto: string;
  cpfCnpj: string;
  endereco: string;
  telefone: string;
  email: string;
};

const ADESAO_VAZIA: AdesaoForm = {
  nomeCompleto: "",
  cpfCnpj: "",
  endereco: "",
  telefone: "",
  email: "",
};

export default function ProcessoGestaoPage() {
  const [reportOpen, setReportOpen] = useState(false);
  const [adesaoOpen, setAdesaoOpen] = useState(false);
  const [form, setForm] = useState<AdesaoForm>(ADESAO_VAZIA);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarAdesao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/brasil-solar/adesao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Não foi possível registrar a adesão.");
      }
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      throw new Error(
        "O cadastro foi criado, mas não foi possível abrir a página do cliente."
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setEnviando(false);
    }
  }

  useEffect(() => {
    document.body.style.overflow = reportOpen || adesaoOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [reportOpen, adesaoOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setReportOpen(false);
      if (!enviando) setAdesaoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enviando]);

  return (
    <div className="pgw">
      <style>{CSS}</style>

      {/* Barra de navegação (some na impressão) */}
      <div className="pg-nav">
        <Link href="/admin/brasil-solar/mapa" className="pg-back">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao mapa
        </Link>
        <button type="button" className="pg-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / PDF
        </button>
      </div>

      <div className="pg-wrap">
        {/* HERO */}
        <header className="pg-hero">
          <span className="pg-brand">
            <span className="pg-sun" />
            Brasil Solar · Pós-venda
          </span>
          <h1>
            Como assumimos a{" "}
            <span className="pg-accent">gestão da sua usina</span>
          </h1>
          <p>
            Um processo completo — da conexão à internet ao acompanhamento
            contínuo — para você ter tranquilidade e o máximo de retorno do seu
            sistema solar.
          </p>
          <span className="pg-badge">
            <ShieldCheck className="h-4 w-4" />
            Da instalação ao relatório, cuidamos de tudo
          </span>
        </header>

        {/* FLUXOGRAMA */}
        <div className="pg-flow">
          {ETAPAS.map((e) => {
            const Icon = e.Icon;
            return (
              <section key={e.n} className={`pg-step ${e.cls}`}>
                <div className="pg-node">
                  <div className="pg-num">
                    <span className="pg-count">{e.n}</span>
                    <Icon />
                  </div>
                </div>
                <article className="pg-card">
                  <h2>{e.titulo}</h2>
                  <p className="pg-lead">{e.lead}</p>
                  <ul>
                    {e.itens.map((it) => (
                      <li key={it}>
                        <span className="pg-tick">
                          <Check />
                        </span>
                        {it}
                      </li>
                    ))}
                  </ul>
                  {e.cta && (
                    <button
                      type="button"
                      className="pg-cta"
                      onClick={() => setReportOpen(true)}
                    >
                      <FileText className="h-4 w-4" />
                      Ver relatório
                    </button>
                  )}
                </article>
              </section>
            );
          })}
        </div>

        {/* BENEFÍCIOS */}
        <section className="pg-benefits">
          <span className="pg-eyebrow">
            <Sparkles className="h-4 w-4" />
            Vantagens de assinante
          </span>
          <h2>
            Assinou o acompanhamento mensal? Você garante{" "}
            <span className="pg-pct">10% de desconto</span>
          </h2>
          <p className="pg-sub">
            Clientes com nosso plano de acompanhamento têm condições exclusivas
            para manter a usina protegida, funcionando bem e gerando o máximo de
            créditos.
          </p>
          <div className="pg-bgrid">
            {BENEFICIOS.map((b) => {
              const Icon = b.Icon;
              return (
                <div key={b.titulo} className="pg-bcard">
                  <div className="pg-bico">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3>{b.titulo}</h3>
                  <p>{b.texto}</p>
                  <span className="pg-btag">{b.tag}</span>
                </div>
              );
            })}
          </div>

          <div className="pg-adesao-wrap">
            <button
              type="button"
              className="pg-adesao-btn"
              onClick={() => {
                setErro(null);
                setForm(ADESAO_VAZIA);
                setAdesaoOpen(true);
              }}
            >
              <Rocket className="h-[18px] w-[18px]" />
              Quero fazer adesão da minha usina
            </button>
            <span className="pg-adesao-hint">
              Cadastro rápido — em seguida você recebe o link para acompanhar sua usina.
            </span>
          </div>
        </section>

        {/* CLOSER */}
        <div className="pg-closer">
          <div className="pg-k">A partir daqui, a sua usina fica em boas mãos. 🌱</div>
          <p>
            Nossa equipe de pós-venda acompanha tudo para você aproveitar ao
            máximo a sua energia solar.
          </p>
        </div>
      </div>

      {/* MODAL: RELATÓRIO MENSAL (EXEMPLO) */}
      {reportOpen && (
        <div
          className="pg-overlay"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setReportOpen(false);
          }}
        >
          <div
            className="pg-report pg-report-pdf"
            role="dialog"
            aria-modal="true"
            aria-label={`Relatório de ${RELATORIO_EXEMPLO.mesLabel} — ${RELATORIO_EXEMPLO.cliente}`}
          >
            <div className="pg-rtop">
              <div className="pg-rbrand">
                <span className="pg-sun" />
                <span>
                  {RELATORIO_EXEMPLO.cliente}
                  <small>Relatório mensal · {RELATORIO_EXEMPLO.mesLabel}</small>
                </span>
              </div>
              <div className="pg-ractions">
                <a
                  href={RELATORIO_EXEMPLO.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pg-ropen"
                >
                  <FileText className="h-4 w-4" />
                  Abrir em nova aba
                </a>
                <button
                  type="button"
                  className="pg-rclose"
                  onClick={() => setReportOpen(false)}
                  aria-label="Fechar"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <div className="pg-pdfwrap">
              <iframe
                className="pg-pdfframe"
                src={RELATORIO_EXEMPLO.pdfUrl}
                title={`Relatório de ${RELATORIO_EXEMPLO.mesLabel} — ${RELATORIO_EXEMPLO.cliente}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADESÃO DA USINA */}
      {adesaoOpen && (
        <div
          className="pg-overlay"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget && !enviando) setAdesaoOpen(false);
          }}
        >
          <div
            className="pg-report pg-adesao-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Adesão da usina"
          >
            <div className="pg-rtop">
              <div className="pg-rbrand">
                <span className="pg-sun" />
                <span>
                  Brasil Solar
                  <small>Adesão ao acompanhamento da usina</small>
                </span>
              </div>
              <button
                type="button"
                className="pg-rclose"
                onClick={() => !enviando && setAdesaoOpen(false)}
                aria-label="Fechar"
                disabled={enviando}
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <form className="pg-rbody" onSubmit={enviarAdesao}>
              <p className="pg-form-intro">
                Preencha os dados básicos do cliente. Criaremos o cadastro
                provisório da usina em Clientes Brasil Solar e abriremos a página
                do cliente para você definir o plano e enviar o convite.
              </p>

              <div className="pg-field">
                <label htmlFor="ad-nome">Nome completo</label>
                <input
                  id="ad-nome"
                  type="text"
                  required
                  autoComplete="name"
                  value={form.nomeCompleto}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nomeCompleto: e.target.value }))
                  }
                  placeholder="Ex.: Maria Aparecida da Silva"
                />
              </div>

              <div className="pg-field">
                <label htmlFor="ad-cpf">CPF / CNPJ</label>
                <input
                  id="ad-cpf"
                  type="text"
                  required
                  inputMode="numeric"
                  value={form.cpfCnpj}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cpfCnpj: e.target.value }))
                  }
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="pg-field">
                <label htmlFor="ad-endereco">Endereço</label>
                <input
                  id="ad-endereco"
                  type="text"
                  required
                  autoComplete="street-address"
                  value={form.endereco}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endereco: e.target.value }))
                  }
                  placeholder="Rua, número, bairro, cidade / UF"
                />
              </div>

              <div className="pg-field-row">
                <div className="pg-field">
                  <label htmlFor="ad-tel">Telefone</label>
                  <input
                    id="ad-tel"
                    type="tel"
                    required
                    autoComplete="tel"
                    value={form.telefone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, telefone: e.target.value }))
                    }
                    placeholder="(54) 90000-0000"
                  />
                </div>
                <div className="pg-field">
                  <label htmlFor="ad-email">E-mail</label>
                  <input
                    id="ad-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="cliente@email.com"
                  />
                </div>
              </div>

              {erro && (
                <div className="pg-form-error">
                  <AlertCircle className="h-4 w-4" />
                  {erro}
                </div>
              )}

              <button type="submit" className="pg-submit" disabled={enviando}>
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 pg-spin" />
                    Registrando adesão...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Cadastrar usina provisória
                  </>
                )}
              </button>

              <p className="pg-form-fine">
                Nada é cobrado agora. Após o cadastro, sua equipe define o plano e
                clica em <strong>“Enviar convite”</strong> para gerar a cobrança.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pgw {
  --pg-sand: #FBF7F0;
  --pg-surface: #FFFFFF;
  --pg-surface-2: #F3EEE4;
  --pg-ink: #14211F;
  --pg-muted: #5C6B67;
  --pg-border: rgba(12, 74, 69, 0.14);
  --pg-teal-deep: #0C4A45;
  --pg-teal: #12857C;
  --pg-teal-bright: #1FB6A6;
  --pg-orange: #F5851F;
  --pg-amber: #FFB020;
  --pg-rail: linear-gradient(180deg, #1FB6A6 0%, #12857C 30%, #F5851F 100%);
  --pg-shadow: 0 1px 2px rgba(12,74,69,.06), 0 12px 32px -12px rgba(12,74,69,.18);
  --pg-grid: rgba(12,74,69,.10);
  color: var(--pg-ink);
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.5;
}
.pgw *, .pgw *::before, .pgw *::after { box-sizing: border-box; }

.pg-nav { display: flex; align-items: center; justify-content: space-between; max-width: 760px; margin: 0 auto; padding: 0 22px; }
.pg-back, .pg-print {
  display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer; border-radius: 10px; padding: 8px 12px; transition: background .15s ease;
}
.pg-back { color: var(--pg-muted); text-decoration: none; }
.pg-back:hover { background: var(--pg-surface-2); }
.pg-print { color: var(--pg-teal-deep); background: var(--pg-surface); border: 1px solid var(--pg-border); }
.pg-print:hover { background: var(--pg-surface-2); }

.pg-wrap {
  max-width: 760px; margin: 0 auto; padding: 18px 22px 60px;
  background:
    radial-gradient(120% 40% at 50% 0%, rgba(255,176,32,.10), transparent 60%);
}

.pg-hero { text-align: center; margin-bottom: 46px; }
.pg-brand { display: inline-flex; align-items: center; gap: 9px; font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--pg-teal); }
.pg-sun { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%;
  background: conic-gradient(from 210deg, var(--pg-amber), var(--pg-orange), var(--pg-amber));
  box-shadow: 0 0 0 3px rgba(245,133,31,.16); }
.pg-sun::after { content:""; width:9px; height:9px; border-radius:50%; background:#fff; opacity:.9; }
.pg-hero h1 { font-size: clamp(28px, 5.5vw, 44px); line-height: 1.05; letter-spacing: -0.025em; font-weight: 800; margin: 20px auto 14px; max-width: 15ch; text-wrap: balance; }
.pg-accent { background: linear-gradient(100deg, var(--pg-teal), var(--pg-teal-bright) 55%, var(--pg-orange)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.pg-hero p { color: var(--pg-muted); font-size: 16.5px; max-width: 52ch; margin: 0 auto; text-wrap: pretty; }
.pg-badge { display:inline-flex; align-items:center; gap:7px; margin-top: 26px; font-size: 13px; font-weight: 600; color: var(--pg-teal-deep);
  background: var(--pg-surface); border: 1px solid var(--pg-border); padding: 7px 15px; border-radius: 999px; box-shadow: var(--pg-shadow); }

.pg-flow { position: relative; padding-left: 4px; }
.pg-flow::before { content: ""; position: absolute; left: 33px; top: 34px; bottom: 34px; width: 3px; border-radius: 3px; background: var(--pg-rail); opacity: .9; }
.pg-step { position: relative; display: grid; grid-template-columns: 68px 1fr; gap: 4px; }
.pg-step + .pg-step { margin-top: 14px; }
.pg-node { position: relative; z-index: 2; width: 68px; display: flex; justify-content: center; }
.pg-num { width: 68px; height: 68px; border-radius: 20px; display: grid; place-items: center; color: #fff; box-shadow: 0 8px 22px -8px rgba(12,74,69,.5); position: relative; }
.pg-num svg { width: 30px; height: 30px; }
.pg-count { position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%; background: var(--pg-surface); color: var(--pg-ink); border: 2px solid currentColor; font-size: 12.5px; font-weight: 800; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.pg-card { background: var(--pg-surface); border: 1px solid var(--pg-border); border-radius: 18px; padding: 18px 20px; box-shadow: var(--pg-shadow); transition: transform .18s ease, box-shadow .18s ease; }
.pg-card:hover { transform: translateY(-2px); box-shadow: 0 1px 2px rgba(12,74,69,.06), 0 22px 44px -16px rgba(12,74,69,.28); }
.pg-card h2 { margin: 0 0 5px; font-size: 19px; letter-spacing: -.01em; font-weight: 750; }
.pg-lead { margin: 0 0 12px; color: var(--pg-ink); opacity: .92; font-size: 14.5px; }
.pg-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
.pg-card li { display: flex; gap: 9px; align-items: flex-start; font-size: 13.5px; color: var(--pg-muted); }
.pg-tick { margin-top: 2px; width: 16px; height: 16px; flex: none; border-radius: 50%; display: grid; place-items: center; }
.pg-tick svg { width: 10px; height: 10px; color: #fff; stroke-width: 3.5; }

.pg-cta { margin-top: 14px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #fff; border: 0; border-radius: 11px; padding: 9px 15px;
  background: linear-gradient(135deg, var(--pg-amber), var(--pg-orange)); box-shadow: 0 8px 18px -8px rgba(245,133,31,.7); transition: transform .15s ease, filter .15s ease; }
.pg-cta:hover { transform: translateY(-1px); filter: brightness(1.04); }

.s1 .pg-num { background: linear-gradient(135deg, #22B8CF, #1098AD); }
.s1 .pg-count, .s1 .pg-tick { color: #1098AD; } .s1 .pg-tick { background:#1098AD; }
.s2 .pg-num { background: linear-gradient(135deg, var(--pg-teal-bright), var(--pg-teal)); }
.s2 .pg-count, .s2 .pg-tick { color: var(--pg-teal); } .s2 .pg-tick { background: var(--pg-teal); }
.s3 .pg-num { background: linear-gradient(135deg, #2FBF71, #17915A); }
.s3 .pg-count, .s3 .pg-tick { color: #17915A; } .s3 .pg-tick { background:#17915A; }
.s4 .pg-num { background: linear-gradient(135deg, var(--pg-amber), var(--pg-orange)); }
.s4 .pg-count, .s4 .pg-tick { color: var(--pg-orange); } .s4 .pg-tick { background: var(--pg-orange); }
.s5 .pg-num { background: linear-gradient(135deg, #FF9E45, #EF6C1A); }
.s5 .pg-count, .s5 .pg-tick { color: #EF6C1A; } .s5 .pg-tick { background:#EF6C1A; }

.pg-benefits { margin-top: 46px; border-radius: 24px; padding: 30px 26px; color: #fff; position: relative; overflow: hidden;
  background: radial-gradient(130% 90% at 100% 0%, rgba(255,176,32,.35), transparent 55%), linear-gradient(135deg, #0C4A45, #12857C);
  box-shadow: 0 20px 50px -20px rgba(12,74,69,.6); }
.pg-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--pg-amber); display: inline-flex; align-items: center; gap: 7px; }
.pg-benefits h2 { margin: 12px 0 4px; font-size: clamp(21px, 4.5vw, 27px); letter-spacing: -.02em; text-wrap: balance; }
.pg-pct { background: linear-gradient(100deg, var(--pg-amber), #FFD37A); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 800; }
.pg-sub { color: rgba(255,255,255,.82); font-size: 14.5px; max-width: 48ch; margin: 0 0 22px; }
.pg-bgrid { display: grid; gap: 12px; grid-template-columns: repeat(3, 1fr); }
.pg-bcard { background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.16); border-radius: 16px; padding: 16px; }
.pg-bico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(255,176,32,.18); color: var(--pg-amber); margin-bottom: 11px; }
.pg-bcard h3 { margin: 0 0 4px; font-size: 15px; letter-spacing: -.01em; }
.pg-bcard p { margin: 0; font-size: 13px; color: rgba(255,255,255,.78); line-height: 1.45; }
.pg-btag { display:inline-block; margin-top:9px; font-size: 11.5px; font-weight: 700; color: #0C4A45; background: var(--pg-amber); padding: 3px 9px; border-radius: 999px; }

.pg-closer { margin-top: 34px; text-align: center; border: 1px dashed var(--pg-border); border-radius: 20px; padding: 26px 24px; background: linear-gradient(180deg, transparent, rgba(31,182,166,.05)); }
.pg-k { font-size: 17px; font-weight: 750; letter-spacing: -.01em; }
.pg-closer p { margin: 6px auto 0; color: var(--pg-muted); max-width: 46ch; font-size: 14.5px; }

.pg-overlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: start center; background: rgba(6,20,18,.62); backdrop-filter: blur(3px); padding: 22px; overflow-y: auto; }
.pg-report { width: 100%; max-width: 640px; background: var(--pg-surface); color: var(--pg-ink); border: 1px solid var(--pg-border); border-radius: 22px; box-shadow: 0 30px 70px -20px rgba(0,0,0,.6); overflow: hidden; margin: 8px 0 40px; animation: pgPop .22s ease; }
@keyframes pgPop { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }
.pg-rtop { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; color: #fff;
  background: radial-gradient(120% 120% at 100% 0%, rgba(255,176,32,.4), transparent 55%), linear-gradient(135deg, #0C4A45, #12857C); }
.pg-rbrand { display:flex; align-items:center; gap:10px; font-weight: 800; letter-spacing:-.01em; }
.pg-rbrand .pg-sun { width: 26px; height:26px; }
.pg-rbrand .pg-sun::after { width:10px; height:10px; }
.pg-rbrand small { display:block; font-weight: 500; font-size: 11.5px; color: rgba(255,255,255,.78); letter-spacing: .04em; }
.pg-rclose { border: 0; cursor: pointer; width: 34px; height: 34px; border-radius: 10px; color: #fff; background: rgba(255,255,255,.16); display: grid; place-items: center; flex: none; }
.pg-rclose:hover { background: rgba(255,255,255,.28); }
.pg-ractions { display: flex; align-items: center; gap: 8px; flex: none; }
.pg-ropen { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; font-size: 12.5px; font-weight: 700; color: #0C4A45; background: var(--pg-amber); padding: 7px 11px; border-radius: 10px; white-space: nowrap; transition: filter .15s ease; }
.pg-ropen:hover { filter: brightness(1.05); }

/* Modal em modo PDF: mais largo e alto, iframe ocupa o corpo */
.pg-report-pdf { max-width: 880px; display: flex; flex-direction: column; max-height: calc(100vh - 60px); }
.pg-pdfwrap { flex: 1; min-height: 0; background: #525659; }
.pg-pdfframe { width: 100%; height: 78vh; border: 0; display: block; }
@media (max-width: 640px) { .pg-ropen span, .pg-report-pdf { max-width: 100%; } .pg-pdfframe { height: 70vh; } }
.pg-rbody { padding: 20px 22px 26px; }
.pg-rexample { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--pg-orange); background: rgba(245,133,31,.12); border: 1px solid rgba(245,133,31,.3); display: inline-block; padding: 3px 9px; border-radius: 999px; margin-bottom: 14px; }
.pg-rclient { font-size: 18px; font-weight: 750; letter-spacing: -.01em; }
.pg-rmeta { color: var(--pg-muted); font-size: 13px; margin-top: 2px; }
.pg-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
.pg-kpi { background: var(--pg-surface-2); border: 1px solid var(--pg-border); border-radius: 14px; padding: 12px; }
.pg-klabel { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--pg-muted); }
.pg-kval { font-size: 20px; font-weight: 800; letter-spacing: -.02em; margin-top: 5px; font-variant-numeric: tabular-nums; }
.pg-kval small { font-size: 12px; font-weight: 600; color: var(--pg-muted); }
.pg-kpi.teal .pg-kval { color: var(--pg-teal); }
.pg-kpi.orange .pg-kval { color: var(--pg-orange); }
.pg-kpi.green .pg-kval { color: #17915A; }
.pg-panel { border: 1px solid var(--pg-border); border-radius: 16px; padding: 16px; margin-top: 14px; }
.pg-panel h4 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--pg-muted); }
.pg-chart { display: flex; align-items: flex-end; gap: 10px; height: 150px; position: relative; padding-top: 6px; }
.pg-grid { position:absolute; left:0; right:0; border-top: 1px dashed var(--pg-grid); }
.pg-barcol { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; z-index: 1; }
.pg-bar { width: 100%; max-width: 34px; border-radius: 7px 7px 3px 3px; background: linear-gradient(180deg, var(--pg-teal-bright), var(--pg-teal)); position: relative; transition: height .6s cubic-bezier(.2,.7,.3,1); }
.pg-bar.cur { background: linear-gradient(180deg, var(--pg-amber), var(--pg-orange)); }
.pg-val { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 11px; font-weight: 700; color: var(--pg-ink); white-space: nowrap; font-variant-numeric: tabular-nums; }
.pg-mlabel { font-size: 11px; color: var(--pg-muted); font-weight: 600; }
.pg-barcol.cur .pg-mlabel { color: var(--pg-orange); }
.pg-credits { display: grid; gap: 9px; }
.pg-crow { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13.5px; }
.pg-cu { display: flex; align-items: center; gap: 9px; color: var(--pg-ink); }
.pg-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--pg-teal); flex: none; }
.pg-kwh { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--pg-teal); }
.pg-ctotal { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--pg-border); display:flex; justify-content: space-between; font-size: 13.5px; font-weight: 700; }
.pg-perfline { display:flex; align-items:center; gap: 10px; margin-top: 4px; }
.pg-perftrack { flex: 1; height: 9px; border-radius: 999px; background: var(--pg-surface-2); overflow: hidden; }
.pg-perffill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--pg-teal), #17915A); }
.pg-perfval { font-weight: 800; color: #17915A; font-size: 15px; font-variant-numeric: tabular-nums; }
.pg-note { margin: 10px 0 0; font-size: 13px; color: var(--pg-muted); }

.pg-adesao-wrap { margin-top: 22px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.pg-adesao-btn { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 800; letter-spacing: -.01em; color: #0C4A45; border: 0; border-radius: 14px; padding: 14px 22px;
  background: linear-gradient(135deg, #FFD37A, var(--pg-amber)); box-shadow: 0 12px 28px -10px rgba(255,176,32,.8); transition: transform .15s ease, filter .15s ease; }
.pg-adesao-btn:hover { transform: translateY(-2px); filter: brightness(1.03); }
.pg-adesao-hint { font-size: 12.5px; color: rgba(255,255,255,.78); }

.pg-adesao-modal { max-width: 520px; }
.pg-form-intro { margin: 0 0 18px; font-size: 14px; color: var(--pg-muted); }
.pg-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.pg-field label { font-size: 12.5px; font-weight: 700; color: var(--pg-teal-deep); }
.pg-field input {
  font-family: inherit; font-size: 14px; color: var(--pg-ink); background: var(--pg-surface);
  border: 1px solid var(--pg-border); border-radius: 11px; padding: 11px 13px; transition: border-color .15s ease, box-shadow .15s ease;
}
.pg-field input::placeholder { color: color-mix(in srgb, var(--pg-muted) 70%, transparent); }
.pg-field input:focus { outline: none; border-color: var(--pg-teal); box-shadow: 0 0 0 3px rgba(18,133,124,.15); }
.pg-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pg-form-error { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #B42318; background: #FEF3F2; border: 1px solid #FDA29B; border-radius: 11px; padding: 10px 12px; margin: 4px 0 14px; }
.pg-submit { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; font-family: inherit; font-size: 14.5px; font-weight: 800; color: #fff; border: 0; border-radius: 13px; padding: 13px 18px; margin-top: 4px;
  background: linear-gradient(135deg, var(--pg-teal-bright), var(--pg-teal)); box-shadow: 0 12px 26px -10px rgba(18,133,124,.8); transition: transform .15s ease, filter .15s ease; }
.pg-submit:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); }
.pg-submit:disabled { opacity: .7; cursor: default; }
.pg-form-fine { margin: 12px 0 0; font-size: 11.5px; color: var(--pg-muted); text-align: center; }
.pg-spin { animation: pgSpin 1s linear infinite; }
@keyframes pgSpin { to { transform: rotate(360deg); } }

@media (max-width: 480px) { .pg-field-row { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .pg-bgrid { grid-template-columns: 1fr; } }
@media (max-width: 520px) { .pg-kpis { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) {
  .pg-step { grid-template-columns: 56px 1fr; }
  .pg-flow::before { left: 27px; }
  .pg-node, .pg-num { width: 56px; }
  .pg-num { height: 56px; border-radius: 17px; }
  .pg-num svg { width: 26px; height: 26px; }
}
@media (prefers-reduced-motion: reduce) { .pgw * { animation: none !important; transition: none !important; } }
@media print { .pg-nav { display: none !important; } }
`;
