"use client";

/**
 * As abas de PIX e BOLETO, compartilhadas pelos dois fluxos de pagamento
 * público do sistema:
 *
 *   - acesso ao portal Brasil Solar  → /api/portal/cobranca/<token>
 *   - fatura de energia da Associação → /api/fatura/<token>
 *
 * 🔑 **O que é compartilhado é a INTERAÇÃO, não o layout.** As duas telas falam
 * a mesma língua com o Asaas (QR, copia-e-cola, linha digitável, PDF do boleto)
 * e mostram cabeçalhos diferentes — uma fala de plano de acesso, a outra de mês
 * de referência e unidade consumidora. Forçar as duas no mesmo componente
 * exigiria um cabeçalho genérico que não descreve bem nenhuma das duas.
 *
 * Por isso a única coisa que muda aqui é o `apiBase`: o prefixo já com o token,
 * sem barra no fim.
 */
import { useEffect, useState } from "react";
import { Barcode, Check, Copy, Download, Loader2, QrCode } from "lucide-react";
import { formatarLinhaDigitavel } from "@/lib/linha-digitavel";

export const TEAL = "#2E9B87";
export const TEAL_DARK = "#1B5E54";
export const ORANGE = "#EA6E2C";
export const INK = "#1F1F1F";
export const INK_SOFT = "#59604F";
export const INK_FAINT = "#8A938D";
export const BORDER = "#E1EAE7";

export function Carregando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: INK_SOFT }}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {texto}
    </div>
  );
}

export function Aviso({ texto }: { texto: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm"
      style={{ background: "#FDECEC", color: "#B4231F" }}
    >
      {texto}
    </div>
  );
}

export function CartaoBranco({
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

export function AbaBotao({
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

export const IconePix = <QrCode className="h-4 w-4" />;
export const IconeBoleto = <Barcode className="h-4 w-4" />;

// ── PIX ─────────────────────────────────────────────────────────────────────

export function AbaPix({ apiBase }: { apiBase: string }) {
  const [dados, setDados] = useState<{ encodedImage: string | null; payload: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/pix`, { cache: "no-store" });
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
  }, [apiBase]);

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

export function AbaBoleto({
  apiBase,
  pdfHref,
  pdfLabel,
  mostrarCodigoBarras = false,
}: {
  apiBase: string;
  /**
   * Substitui o PDF do boleto hospedado pelo Asaas.
   *
   * 🔑 A fatura de energia aponta para o NOSSO demonstrativo, que já traz o
   * código de barras impresso: o cliente baixa um documento com a marca da
   * empresa e a explicação do valor, em vez de um boleto avulso do gateway.
   * O portal Brasil Solar não passa a prop e continua com o PDF do Asaas.
   */
  pdfHref?: string;
  pdfLabel?: string;
  /**
   * Desenha a barra do boleto na tela, quando a rota devolve
   * `codigoBarrasPng`. Existe para quem paga no caixa ou pelo app que lê a
   * barra pela câmera — sem isso a única saída era baixar o PDF.
   *
   * Fica atrás de uma chave porque o pagamento do portal Brasil Solar
   * compartilha este componente e a rota dele não devolve a imagem.
   */
  mostrarCodigoBarras?: boolean;
}) {
  const [dados, setDados] = useState<{
    linhaDigitavel: string | null;
    bankSlipUrl: string | null;
    codigoBarrasPng?: string | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/boleto`, { cache: "no-store" });
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
  }, [apiBase]);

  if (erro) return <Aviso texto={erro} />;
  if (!dados) return <Carregando texto="Gerando boleto…" />;

  return (
    <div>
      {/* A BARRA primeiro: quem paga no caixa ou aponta a câmera resolve aqui
          e nem lê o resto. Quem digita desce dois centímetros. */}
      {mostrarCodigoBarras && dados.codigoBarrasPng && (
        <div
          className="mb-4 flex flex-col items-center gap-2 rounded-lg border px-3 py-4"
          style={{ borderColor: BORDER, background: "#FFFFFF" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dados.codigoBarrasPng}
            alt="Código de barras do boleto"
            className="w-full"
            style={{ maxWidth: 420, height: "auto", imageRendering: "pixelated" }}
          />
          <span className="text-xs" style={{ color: INK_SOFT }}>
            Aponte a câmera do app do banco para o código acima
          </span>
        </div>
      )}

      <p className="text-xs" style={{ color: INK_SOFT }}>
        Linha digitável
      </p>
      {/* Agrupada como sai impressa no boleto — é assim que a pessoa confere
          contra o papel ou contra a tela do banco antes de pagar. O `break-all`
          saiu junto: quebrar no meio de um bloco desfaz o agrupamento. */}
      <div
        className="mt-1 rounded-lg border px-3 py-2.5 text-sm font-mono"
        style={{ borderColor: BORDER, color: INK, wordSpacing: "0.15em", lineHeight: 1.55 }}
      >
        {dados.linhaDigitavel ? formatarLinhaDigitavel(dados.linhaDigitavel) : "—"}
      </div>
      {dados.linhaDigitavel && (
        <button
          type="button"
          onClick={async () => {
            // Copia SÓ OS DÍGITOS: o campo do app do banco costuma recusar
            // ponto e espaço. Na tela fica agrupado, na área de transferência
            // vai limpo — o contrário obrigaria a pessoa a apagar separador a
            // separador no celular.
            await navigator.clipboard.writeText(dados.linhaDigitavel!.replace(/\D/g, ""));
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
      {(pdfHref || dados.bankSlipUrl) && (
        <a
          href={pdfHref ?? dados.bankSlipUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: ORANGE }}
        >
          <Download className="h-4 w-4" />
          {pdfLabel ?? "Baixar boleto (PDF)"}
        </a>
      )}
    </div>
  );
}
