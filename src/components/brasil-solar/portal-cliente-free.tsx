import { Check, ArrowRight } from "lucide-react";
import type { PortalGeracaoFree } from "@/lib/portal-cliente-data";
import {
  GeracaoDiariaCard,
  GeracaoMensalCard,
} from "@/components/brasil-solar/portal-cliente-dashboard";

/**
 * Portal do cliente — versão GRÁTIS (free-tier). Mostra só geração diária e
 * mensal (os mesmos cards/seletores do plano pago) e, ao lado, o painel de
 * upgrade pro "Plano de Acompanhamento". Tudo que é exclusivo do pago
 * (relatórios, cruzamento com a fatura, alertas, payback) aparece como benefício
 * bloqueado, nunca com dado real — o payload já vem enxuto do servidor.
 *
 * Conceito aprovado com o cliente (2026-07-23): dados livres à esquerda,
 * comparativo Grátis × Plano fixo à direita.
 */

const ORANGE = "#EA6E2C";
const ORANGE_DEEP = "#C2551C";
const INK = "#1F1F1F";
const INK_SOFT = "#59604F";
const INK_FAINT = "#8A938D";
const BORDER = "#E1EAE7";
const GOOD = "#16A34A";

/** Comparativo Grátis × Plano de Acompanhamento (ordem exibida no painel). */
const RECURSOS: { label: string; free: boolean }[] = [
  { label: "Geração diária e mensal", free: true },
  { label: "Status do sistema (online/offline)", free: true },
  { label: "Relatórios mensais (PDF)", free: false },
  { label: "Cruzamento com a fatura de energia", free: false },
  { label: "Alertas de queda de geração", free: false },
  { label: "Payback e histórico completo", free: false },
  { label: "Desconto em inspeção completa", free: false },
  { label: "Desconto em seguros", free: false },
];

export function PortalClienteFree({
  data,
  proprietarioId,
  precoLabel,
  ctaHref,
}: {
  data: PortalGeracaoFree;
  proprietarioId?: string;
  /** Ex.: "R$ 39/mês". */
  precoLabel: string;
  /** Destino do botão "Contratar plano completo" (pagamento ou contato). */
  ctaHref: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      {/* Coluna de dados livres: geração diária + geração mensal empilhadas */}
      <div className="space-y-4 min-w-0">
        <GeracaoDiariaCard
          curvaInicial={data.curvaDia}
          statusInicial={data.statusMonitoramento}
          hojeYmd={data.hojeYmd}
          proprietarioId={proprietarioId}
          totalMensal={{ label: data.mesAtualLabel, kwh: data.mesAtualKwh }}
        />
        <GeracaoMensalCard
          serieInicial={data.serieMensal}
          anosDisponiveis={data.anosDisponiveis}
          proprietarioId={proprietarioId}
        />
      </div>

      {/* Painel de upgrade */}
      <UpgradePanel precoLabel={precoLabel} ctaHref={ctaHref} />
    </div>
  );
}

function UpgradePanel({
  precoLabel,
  ctaHref,
}: {
  precoLabel: string;
  ctaHref: string | null;
}) {
  return (
    <aside className="lg:sticky lg:top-6">
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: BORDER,
          background: "linear-gradient(180deg, #EAF5F2, #FFFFFF 46%)",
        }}
      >
        <span
          className="inline-block text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
          style={{ color: ORANGE_DEEP, background: "#FDE9D7" }}
        >
          Recomendado
        </span>

        <h3 className="mt-3 text-lg font-bold" style={{ color: INK }}>
          Plano de Acompanhamento
        </h3>
        <p className="mt-1 text-sm" style={{ color: INK_SOFT }}>
          Seu sistema monitorado de ponta a ponta, com relatório todo mês.
        </p>

        <div className="mt-3 mb-1 flex items-baseline gap-1.5">
          <span
            className="text-3xl font-extrabold tracking-tight tabular-nums"
            style={{ color: INK }}
          >
            {precoLabel}
          </span>
          <span className="text-sm font-medium" style={{ color: INK_SOFT }}>
            por usina
          </span>
        </div>

        <ul className="mt-4 mb-4 divide-y" style={{ borderColor: BORDER }}>
          <li
            className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2 text-[11px] font-bold uppercase tracking-wide"
            style={{ color: INK_FAINT }}
          >
            <span>Recurso</span>
            <span className="w-11 text-center">Grátis</span>
            <span className="w-11 text-center">Plano</span>
          </li>
          {RECURSOS.map((r) => (
            <li
              key={r.label}
              className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2 text-[13px]"
              style={{ color: INK, borderColor: "#EDF3F1" }}
            >
              <span>{r.label}</span>
              <span className="w-11 text-center">
                {r.free ? (
                  <Check className="inline h-4 w-4" style={{ color: GOOD }} />
                ) : (
                  <span style={{ color: INK_FAINT, opacity: 0.6 }}>—</span>
                )}
              </span>
              <span className="w-11 text-center">
                <Check className="inline h-4 w-4" style={{ color: GOOD }} />
              </span>
            </li>
          ))}
        </ul>

        {ctaHref ? (
          <a
            href={ctaHref}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: ORANGE }}
          >
            Contratar plano completo
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <div
            className="rounded-xl border border-dashed px-4 py-3 text-center text-[13px]"
            style={{ borderColor: BORDER, color: INK_SOFT }}
          >
            Fale com a Rede Brasil Solar para ativar seu plano.
          </div>
        )}
      </div>
    </aside>
  );
}
