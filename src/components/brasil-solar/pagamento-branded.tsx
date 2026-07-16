"use client";

/**
 * Tela de pagamento BRANDED do portal do cliente Brasil Solar.
 * Substitui o checkout hospedado do Asaas: o cliente vê o nosso visual e paga
 * por PIX, boleto ou cartão sem sair do domínio da Brasil Solar.
 * Dados vêm das rotas públicas /api/portal/cobranca/[token]/*.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode,
  Barcode,
  CreditCard,
  Copy,
  Check,
  Download,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

const TEAL = "#2E9B87";
const TEAL_DARK = "#1B5E54";
const ORANGE = "#EA6E2C";
const INK = "#1F1F1F";
const INK_SOFT = "#59604F";
const INK_FAINT = "#8A938D";
const BORDER = "#E1EAE7";

type Situacao = "aberto" | "pago" | "indisponivel";
type Aba = "pix" | "boleto" | "cartao";

interface CobrancaView {
  proprietarioNome: string;
  modalidade: string;
  valor: number;
  situacao: Situacao;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelModalidade(m: string): string {
  if (m === "ANUAL") return "Plano anual";
  if (m === "MENSAL") return "Plano mensal";
  return m;
}

export default function PagamentoBranded({
  token,
  inicial,
}: {
  token: string;
  inicial: CobrancaView;
}) {
  const [view, setView] = useState<CobrancaView>(inicial);
  const [aba, setAba] = useState<Aba>("pix");

  // Polling: enquanto estiver "aberto", checa a cada 6s se o pagamento entrou
  // (PIX/boleto confirmam de forma assíncrona pelo banco → webhook Asaas).
  useEffect(() => {
    if (view.situacao !== "aberto") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/portal/cobranca/${token}`, { cache: "no-store" });
        if (r.ok) {
          const nova = (await r.json()) as CobrancaView;
          if (nova.situacao === "pago") setView(nova);
        }
      } catch {
        /* silencioso — tenta de novo no próximo tick */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [view.situacao, token]);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-4 py-8"
      style={{ background: `linear-gradient(180deg, #F4F9F7 0%, #FFFFFF 40%)` }}
    >
      <div className="w-full max-w-md">
        {/* Marca */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="h-9 w-9 rounded-lg grid place-items-center text-white font-bold"
            style={{ background: TEAL }}
          >
            BS
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold" style={{ color: INK }}>
              Rede Brasil Solar
            </div>
            <div className="text-xs" style={{ color: INK_FAINT }}>
              Portal do Cliente
            </div>
          </div>
        </div>

        {view.situacao === "pago" ? (
          <PagamentoConfirmado view={view} />
        ) : view.situacao === "indisponivel" ? (
          <CartaoBranco>
            <div className="text-center py-6">
              <p className="text-sm font-semibold" style={{ color: INK }}>
                Cobrança indisponível
              </p>
              <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>
                Este link não tem uma cobrança em aberto. Fale com a Brasil Solar
                para gerar um novo link de pagamento.
              </p>
            </div>
          </CartaoBranco>
        ) : (
          <>
            {/* Resumo do plano */}
            <CartaoBranco className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: INK_FAINT }}>
                {labelModalidade(view.modalidade)}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums" style={{ color: INK }}>
                  {brl(view.valor)}
                </span>
                {view.modalidade === "MENSAL" && (
                  <span className="text-sm font-medium" style={{ color: INK_SOFT }}>
                    /mês
                  </span>
                )}
              </div>
              {view.proprietarioNome && (
                <div className="mt-1 text-sm" style={{ color: INK_SOFT }}>
                  {view.proprietarioNome}
                </div>
              )}
            </CartaoBranco>

            {/* Abas */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <AbaBotao ativo={aba === "pix"} onClick={() => setAba("pix")} icon={<QrCode className="h-4 w-4" />} label="PIX" />
              <AbaBotao ativo={aba === "boleto"} onClick={() => setAba("boleto")} icon={<Barcode className="h-4 w-4" />} label="Boleto" />
              <AbaBotao ativo={aba === "cartao"} onClick={() => setAba("cartao")} icon={<CreditCard className="h-4 w-4" />} label="Cartão" />
            </div>

            <CartaoBranco>
              {aba === "pix" && <AbaPix token={token} />}
              {aba === "boleto" && <AbaBoleto token={token} />}
              {aba === "cartao" && (
                <AbaCartao token={token} onPago={() => setView((v) => ({ ...v, situacao: "pago" }))} />
              )}
            </CartaoBranco>
          </>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs" style={{ color: INK_FAINT }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          Pagamento processado com segurança
        </div>
      </div>
    </div>
  );
}

function CartaoBranco({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border rounded-2xl p-5 ${className}`}
      style={{ borderColor: BORDER, boxShadow: "0 1px 2px rgba(27,94,84,0.04)" }}
    >
      {children}
    </div>
  );
}

function AbaBotao({
  ativo,
  onClick,
  icon,
  label,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-colors"
      style={{
        borderColor: ativo ? TEAL : BORDER,
        background: ativo ? "#EAF6F2" : "#FFFFFF",
        color: ativo ? TEAL_DARK : INK_SOFT,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function PagamentoConfirmado({ view }: { view: CobrancaView }) {
  return (
    <CartaoBranco>
      <div className="text-center py-6">
        <CheckCircle2 className="h-14 w-14 mx-auto" style={{ color: TEAL }} />
        <p className="mt-3 text-lg font-bold" style={{ color: INK }}>
          Pagamento confirmado!
        </p>
        <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>
          {view.proprietarioNome ? `${view.proprietarioNome}, seu` : "Seu"} acesso ao
          Portal do Cliente Brasil Solar foi liberado. Você vai receber um e-mail
          para criar seu login e acompanhar a geração das suas usinas.
        </p>
      </div>
    </CartaoBranco>
  );
}

// ── PIX ─────────────────────────────────────────────────────────────────────
function AbaPix({ token }: { token: string }) {
  const [dados, setDados] = useState<{ encodedImage: string | null; payload: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/portal/cobranca/${token}/pix`, { cache: "no-store" });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j.error || "Não foi possível gerar o PIX.");
        else setDados(j);
      } catch {
        if (vivo) setErro("Falha de conexão ao gerar o PIX.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (erro) return <Aviso texto={erro} />;
  if (!dados) return <Carregando texto="Gerando PIX…" />;

  return (
    <div className="flex flex-col items-center">
      {dados.encodedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${dados.encodedImage}`}
          alt="QR Code do PIX"
          className="h-52 w-52 rounded-lg border"
          style={{ borderColor: BORDER }}
        />
      ) : (
        <Aviso texto="QR indisponível — use o código copia-e-cola abaixo." />
      )}
      <p className="mt-3 text-xs text-center" style={{ color: INK_SOFT }}>
        Abra o app do seu banco, escolha pagar com PIX e escaneie o QR Code ou use
        o código abaixo.
      </p>
      {dados.payload && (
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(dados.payload!);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: TEAL }}
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? "Código copiado!" : "Copiar código PIX"}
        </button>
      )}
    </div>
  );
}

// ── Boleto ──────────────────────────────────────────────────────────────────
function AbaBoleto({ token }: { token: string }) {
  const [dados, setDados] = useState<{ linhaDigitavel: string | null; bankSlipUrl: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/portal/cobranca/${token}/boleto`, { cache: "no-store" });
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(j.error || "Não foi possível gerar o boleto.");
        else setDados(j);
      } catch {
        if (vivo) setErro("Falha de conexão ao gerar o boleto.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  if (erro) return <Aviso texto={erro} />;
  if (!dados) return <Carregando texto="Gerando boleto…" />;

  return (
    <div>
      <p className="text-xs" style={{ color: INK_SOFT }}>
        Linha digitável
      </p>
      <div
        className="mt-1 rounded-lg border px-3 py-2.5 text-sm font-mono break-all"
        style={{ borderColor: BORDER, color: INK }}
      >
        {dados.linhaDigitavel || "—"}
      </div>
      {dados.linhaDigitavel && (
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(dados.linhaDigitavel!);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
          style={{ border: `1px solid ${TEAL}`, color: TEAL_DARK }}
        >
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? "Copiado!" : "Copiar linha digitável"}
        </button>
      )}
      {dados.bankSlipUrl && (
        <a
          href={dados.bankSlipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: ORANGE }}
        >
          <Download className="h-4 w-4" />
          Baixar boleto (PDF)
        </a>
      )}
    </div>
  );
}

// ── Cartão ──────────────────────────────────────────────────────────────────
function AbaCartao({ token, onPago }: { token: string; onPago: () => void }) {
  const [form, setForm] = useState({
    number: "",
    holderName: "",
    expiry: "",
    ccv: "",
    titularNome: "",
    email: "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function pagar() {
    setErro(null);
    const [mm, aa] = form.expiry.split("/").map((s) => s.trim());
    if (!mm || !aa) {
      setErro("Validade inválida — use MM/AAAA.");
      return;
    }
    const expiryYear = aa.length === 2 ? `20${aa}` : aa;
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/cobranca/${token}/cartao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartao: {
            holderName: form.holderName,
            number: form.number,
            expiryMonth: mm,
            expiryYear,
            ccv: form.ccv,
          },
          titular: {
            name: form.titularNome || form.holderName,
            email: form.email,
            cpfCnpj: form.cpfCnpj,
            postalCode: form.postalCode,
            addressNumber: form.addressNumber,
            phone: form.phone,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j.error || "Pagamento não autorizado.");
        return;
      }
      onPago();
    } catch {
      setErro("Falha de conexão ao processar o pagamento.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      <Campo label="Número do cartão" value={form.number} onChange={set("number")} placeholder="0000 0000 0000 0000" inputMode="numeric" />
      <Campo label="Nome impresso no cartão" value={form.holderName} onChange={set("holderName")} placeholder="Como está no cartão" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Validade" value={form.expiry} onChange={set("expiry")} placeholder="MM/AAAA" inputMode="numeric" />
        <Campo label="CVV" value={form.ccv} onChange={set("ccv")} placeholder="123" inputMode="numeric" />
      </div>

      <div className="pt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: INK_FAINT }}>
        Dados do titular
      </div>
      <Campo label="CPF/CNPJ" value={form.cpfCnpj} onChange={set("cpfCnpj")} placeholder="Somente números" inputMode="numeric" />
      <Campo label="E-mail" value={form.email} onChange={set("email")} placeholder="voce@email.com" type="email" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="CEP" value={form.postalCode} onChange={set("postalCode")} placeholder="00000-000" inputMode="numeric" />
        <Campo label="Nº" value={form.addressNumber} onChange={set("addressNumber")} placeholder="123" inputMode="numeric" />
      </div>
      <Campo label="Telefone" value={form.phone} onChange={set("phone")} placeholder="(00) 00000-0000" inputMode="numeric" />

      {erro && <Aviso texto={erro} />}

      <button
        type="button"
        disabled={enviando}
        onClick={pagar}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: TEAL }}
      >
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {enviando ? "Processando…" : "Pagar com cartão"}
      </button>
      <p className="text-[11px] text-center" style={{ color: INK_FAINT }}>
        Seus dados de cartão são enviados com segurança e não são armazenados por nós.
      </p>
    </div>
  );
}

function Campo({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: INK_SOFT }}>
        {label}
      </span>
      <input
        {...props}
        className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2"
        style={{ borderColor: BORDER, color: INK }}
      />
    </label>
  );
}

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: INK_SOFT }}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {texto}
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm"
      style={{ background: "#FDECEC", color: "#B4231F" }}
    >
      {texto}
    </div>
  );
}
