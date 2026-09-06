"use client";

/**
 * A fatura de energia como o CLIENTE a vê ao abrir o link do email ou do
 * WhatsApp. Sem login, no domínio da empresa, em vez do checkout hospedado do
 * Asaas.
 *
 * Três coisas numa tela só, porque é isso que o cliente quer resolver:
 * quanto é, como pagar, e ver o demonstrativo que explica o valor.
 *
 * PIX e boleto vêm de `components/pagamento/abas-pagamento.tsx`, compartilhado
 * com o pagamento do portal Brasil Solar. Cartão não entra aqui por decisão de
 * 06/09/2026: dado de cartão passando pela nossa página é responsabilidade que
 * a cobrança recorrente de energia não precisa assumir.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import {
  AbaBoleto,
  AbaBotao,
  AbaPix,
  Aviso,
  CartaoBranco,
  BORDER,
  INK,
  INK_FAINT,
  INK_SOFT,
  IconeBoleto,
  IconePix,
  TEAL,
  TEAL_DARK,
} from "@/components/pagamento/abas-pagamento";

export interface FaturaView {
  clienteNome: string;
  unidadeConsumidora: string;
  referencia: string;
  valor: number;
  vencimento: string | null;
  situacao: "aberto" | "pago" | "indisponivel";
  temDemonstrativo: boolean;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function FaturaPublicaView({
  token,
  inicial,
  empresa,
}: {
  token: string;
  inicial: FaturaView;
  empresa: string;
}) {
  const [view, setView] = useState<FaturaView>(inicial);
  const [aba, setAba] = useState<"pix" | "boleto">("pix");
  const apiBase = `/api/fatura/${token}`;

  // PIX e boleto confirmam de forma assíncrona (banco → webhook do Asaas).
  // Enquanto estiver em aberto, pergunta a cada 6s — assim o cliente vê a tela
  // virar "pago" sem precisar recarregar, logo depois de pagar no app do banco.
  useEffect(() => {
    if (view.situacao !== "aberto") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiBase, { cache: "no-store" });
        if (!r.ok) return;
        const nova = (await r.json()) as FaturaView;
        if (nova.situacao === "pago") setView(nova);
      } catch {
        /* silencioso — tenta no próximo tique */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [view.situacao, apiBase]);

  const linkDemonstrativo = `${apiBase}/demonstrativo`;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-4 py-8"
      style={{ background: "#F6F8F7" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="text-sm font-semibold" style={{ color: TEAL_DARK }}>
            {empresa}
          </div>
          <div className="text-xs" style={{ color: INK_FAINT }}>
            Fatura de energia · {view.referencia}
          </div>
        </div>

        <CartaoBranco className="mb-4">
          <div className="text-xs" style={{ color: INK_SOFT }}>
            Unidade consumidora {view.unidadeConsumidora}
          </div>
          <div className="mt-0.5 text-sm font-medium" style={{ color: INK }}>
            {view.clienteNome}
          </div>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-xs" style={{ color: INK_SOFT }}>
                Valor
              </div>
              <div className="text-2xl font-bold" style={{ color: TEAL_DARK }}>
                {brl(view.valor)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: INK_SOFT }}>
                Vencimento
              </div>
              <div className="text-sm font-semibold" style={{ color: INK }}>
                {dataBR(view.vencimento)}
              </div>
            </div>
          </div>
        </CartaoBranco>

        {view.situacao === "pago" ? (
          <CartaoBranco className="mb-4">
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="h-10 w-10" style={{ color: TEAL }} />
              <div className="mt-2 text-base font-semibold" style={{ color: TEAL_DARK }}>
                Pagamento confirmado
              </div>
              <p className="mt-1 text-sm" style={{ color: INK_SOFT }}>
                Recebemos o pagamento desta fatura. Obrigado!
              </p>
            </div>
          </CartaoBranco>
        ) : view.situacao === "indisponivel" ? (
          <div className="mb-4">
            <Aviso texto="Esta fatura não está disponível para pagamento no momento. Fale com a gente respondendo o email da cobrança." />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <AbaBotao ativo={aba === "pix"} onClick={() => setAba("pix")} icon={IconePix} label="PIX" />
              <AbaBotao
                ativo={aba === "boleto"}
                onClick={() => setAba("boleto")}
                icon={IconeBoleto}
                label="Boleto"
              />
            </div>
            <CartaoBranco className="mb-4">
              {aba === "pix" ? <AbaPix apiBase={apiBase} /> : <AbaBoleto apiBase={apiBase} />}
            </CartaoBranco>
          </>
        )}

        {/* O demonstrativo aparece SEMPRE, inclusive depois de pago: é o
            documento que explica o valor, e é justamente depois de pagar que
            alguém volta para conferir a conta. */}
        {view.temDemonstrativo && (
          <a
            href={linkDemonstrativo}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
            style={{ border: `1px solid ${BORDER}`, background: "#fff", color: TEAL_DARK }}
          >
            <FileText className="h-4 w-4" />
            Ver demonstrativo da fatura
          </a>
        )}

        <div
          className="mt-6 flex items-center justify-center gap-1.5 text-xs"
          style={{ color: INK_FAINT }}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Pagamento processado com segurança
        </div>
      </div>
    </div>
  );
}
