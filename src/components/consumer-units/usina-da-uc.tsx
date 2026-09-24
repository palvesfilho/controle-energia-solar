"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VinculoUc } from "@/lib/uc-vinculo-rateio";

/**
 * Célula "Usina" da lista de UCs — lê o vínculo dos RATEIOS
 * (`lib/uc-vinculo-rateio.ts`), não o campo do cadastro.
 *
 * - Vigente: nome da usina, como sempre foi.
 * - Só pendente (1º rateio): nome da usina + ⚠️ âmbar — a UC já está destinada
 *   a ela, mas ainda não compensa.
 * - Vigente em A + pendente em B (transferência): mostra **A** + ⚠️ âmbar.
 *   Quem compensa até a RGE aprovar é A; mostrar B seria antecipar um efeito
 *   que o protocolo ainda não produziu.
 * - Sem nada: "sem usina" em vermelho, com o motivo quando há (rateio
 *   rejeitado, ou o cadastro aponta uma usina sem rateio nenhum).
 *
 * O ⚠️ leva à tela de Rateios já com a usina do pedido selecionada.
 */

const SITUACAO_PROTOCOLO: Record<string, string> = {
  VALIDADO: "a RGE já concluiu — falta conferir a fatura e aceitar",
  EM_ANDAMENTO: "em andamento na RGE",
  REJEITADO: "a RGE rejeitou — falta registrar aqui",
  NAO_ENCONTRADO: "protocolo não encontrado na RGE",
  ERRO: "a consulta automática na RGE está com erro",
  SEM_CREDENCIAL: "sem credencial para consultar na RGE",
  PROTOCOLO_INVALIDO: "número de protocolo inválido",
};

function data(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "?";
}

function pct(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Nome para busca, filtro e exportação: o que a célula mostra como usina. */
export function usinaExibida(v: VinculoUc | undefined): string | undefined {
  return v?.vigentes[0]?.plantName ?? v?.pendentes[0]?.plantName;
}

function Aviso({
  href,
  cor,
  children,
}: {
  href: string;
  cor: "amber" | "red";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label="Ver rateio"
            className={`inline-flex shrink-0 ${cor === "red" ? "text-red-600" : "text-amber-600"} hover:opacity-70`}
          />
        }
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm whitespace-normal p-3 text-[12px] leading-relaxed">
        <div className="space-y-1">{children}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function LinhaPendente({ p }: { p: VinculoUc["pendentes"][number] }) {
  return (
    <div>
      Protocolo {p.protocolo ?? <em>não informado</em>} · {pct(p.percentual)} · aguardando a RGE desde{" "}
      {data(p.criadoEm)}
      {p.protocoloSituacao && SITUACAO_PROTOCOLO[p.protocoloSituacao] && (
        <div className="opacity-80">↳ {SITUACAO_PROTOCOLO[p.protocoloSituacao]}</div>
      )}
    </div>
  );
}

const rateiosDa = (plantId: string) => `/admin/gestao-creditos/rateios?plantId=${plantId}`;

export function UsinaDaUc({
  vinculo,
  plantCadastro,
  active,
}: {
  vinculo: VinculoUc | undefined;
  /** Campo `plantId` do cadastro — só entra como pista quando não há rateio. */
  plantCadastro: { id: string; name: string } | null;
  active: boolean;
}) {
  const vigentes = vinculo?.vigentes ?? [];
  const pendentes = vinculo?.pendentes ?? [];

  if (vigentes.length) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {vigentes.map((v, i) => (
          <span key={v.plantId}>
            <Link
              href={`/admin/usinas/${v.plantId}`}
              title={`Rateio vigente: ${pct(v.percentual)}`}
              className="hover:text-primary hover:underline underline-offset-2 transition-colors"
            >
              {v.plantName}
            </Link>
            {i < vigentes.length - 1 && " + "}
          </span>
        ))}
        {vigentes.length > 1 && (
          <Aviso href={rateiosDa(vigentes[0].plantId)} cor="red">
            <div className="font-semibold">Em {vigentes.length} rateios vigentes ao mesmo tempo</div>
            {vigentes.map((v) => (
              <div key={v.plantId}>
                {v.plantName}: {pct(v.percentual)}
              </div>
            ))}
            <div className="opacity-80">Conferir qual deles a RGE aplica de fato.</div>
          </Aviso>
        )}
        {pendentes.length > 0 && (
          <Aviso href={rateiosDa(pendentes[0].plantId)} cor="amber">
            <div className="font-semibold">
              Em transferência para {pendentes.map((p) => p.plantName).join(" + ")}
            </div>
            <div>Até a RGE aprovar, quem compensa é {vigentes.map((v) => v.plantName).join(" + ")}.</div>
            {pendentes.map((p) => (
              <LinhaPendente key={p.versionId} p={p} />
            ))}
          </Aviso>
        )}
      </div>
    );
  }

  if (pendentes.length) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {pendentes.map((p, i) => (
          <span key={p.versionId}>
            <Link
              href={`/admin/usinas/${p.plantId}`}
              className="text-muted-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
            >
              {p.plantName}
            </Link>
            {i < pendentes.length - 1 && " + "}
          </span>
        ))}
        <Aviso href={rateiosDa(pendentes[0].plantId)} cor="amber">
          <div className="font-semibold">1º rateio, ainda não aprovado</div>
          <div>A UC ainda não compensa: nenhum rateio vigente a inclui.</div>
          {pendentes.map((p) => (
            <LinhaPendente key={p.versionId} p={p} />
          ))}
        </Aviso>
      </div>
    );
  }

  const rej = vinculo?.rejeitado;
  const motivo = rej ? (
    <>
      <div className="font-semibold">Rateio rejeitado em {data(rej.em)}</div>
      <div>
        Usina {rej.plantName}
        {rej.protocolo ? ` · protocolo ${rej.protocolo}` : ""}
      </div>
    </>
  ) : plantCadastro ? (
    <>
      <div className="font-semibold">Não está em nenhum rateio</div>
      <div>
        O cadastro da UC aponta {plantCadastro.name}, mas só o rateio vigente faz a UC receber crédito.
      </div>
    </>
  ) : null;

  return (
    <div className="flex items-center gap-1.5">
      <span className={active ? "text-red-700 text-xs font-medium" : "text-muted-foreground text-xs"}>
        sem usina
      </span>
      {motivo && (
        <Aviso href={rateiosDa(rej?.plantId ?? plantCadastro?.id ?? "")} cor="red">
          {motivo}
        </Aviso>
      )}
    </div>
  );
}
