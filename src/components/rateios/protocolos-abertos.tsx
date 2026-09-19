"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { FiltrosTabela } from "@/components/ui/filtros-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";
import { useFiltroTabela, type Faceta } from "@/lib/filtro-tabela";
import { formatCodigoUc } from "@/lib/uc-codigo";
import {
  SITUACAO_LABEL,
  SITUACAO_TOM,
  type SituacaoProtocolo,
} from "@/lib/rge-protocolo";

/**
 * Aba "Protocolos em aberto": todo pedido registrado na concessionária que
 * ainda não virou rateio vigente, de todas as usinas.
 *
 * ## Para que serve
 *
 * Levar o número na mão até o portal da concessionária e, na volta, saber a
 * quais UCs aquele pedido mexe. Por isso a busca varre TAMBÉM o nome e o código
 * das UCs: dá para chegar pelo protocolo e achar as UCs, ou chegar por uma UC e
 * achar em que protocolo ela está pendurada.
 *
 * ## O número é o do PEDIDO
 *
 * O campo se chama "protocolo", mas o que se guarda é o número do PEDIDO — a
 * chave estável. O protocolo que a CPFL exibe é regenerado a cada consulta e
 * não acha nada na segunda vez. Por isso o botão de copiar entrega só os
 * dígitos: é essa a forma que o portal aceita.
 */

type UcDoProtocolo = {
  id: string;
  nome: string;
  codigoUc: string | null;
  codigoUcAntigo: string | null;
  cidade: string | null;
  percentual: number;
};

type ProtocoloAberto = {
  rateioId: string;
  protocolo: string | null;
  protocoloDigitos: string | null;
  consultavel: boolean;
  plantId: string;
  plantNome: string;
  plantCidade: string | null;
  plantUc: string | null;
  concessionaria: string | null;
  temCredencialRge: boolean;
  situacao: string | null;
  statusRge: string | null;
  consultadoEm: string | null;
  tentativaEm: string | null;
  erro: string | null;
  criadoEm: string;
  enviadoEm: string | null;
  vigenteAPartirDe: string;
  precisaConferencia: boolean;
  diasEmAberto: number;
  totalUcs: number;
  somaPercentual: number;
  ucs: UcDoProtocolo[];
};

type SemProtocolo = {
  rateioId: string;
  plantId: string;
  plantNome: string;
  diasEmAberto: number;
};

type Resposta = {
  protocolos: ProtocoloAberto[];
  semProtocolo: SemProtocolo[];
  resumo: {
    emAberto: number;
    precisamConferencia: number;
    nuncaConsultados: number;
    semCredencial: number;
    numeroInvalido: number;
    semProtocolo: number;
    ucsEnvolvidas: number;
  };
};

const pct = (n: number) =>
  `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

const dataBr = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR") : "—";

const TONS: Record<string, string> = {
  verde: "text-emerald-600 dark:text-emerald-500",
  ambar: "text-amber-600 dark:text-amber-500",
  vermelho: "text-red-600 dark:text-red-500",
  cinza: "text-muted-foreground",
};

/**
 * Rótulo da situação. Nunca consultado é diferente de "não encontrado": o
 * primeiro é robô que não passou, o segundo é leitura que deu certo e não
 * achou. Confundir os dois é o falso negativo calado.
 */
function rotuloSituacao(p: ProtocoloAberto): string {
  if (!p.situacao) {
    return p.temCredencialRge ? "Aguardando consulta" : "Sem login da RGE";
  }
  const chave = p.situacao as SituacaoProtocolo;
  return (
    SITUACAO_LABEL[chave] ??
    (p.statusRge ? `RGE: "${p.statusRge}"` : p.situacao)
  );
}

function tomSituacao(p: ProtocoloAberto): string {
  if (!p.situacao) return p.temCredencialRge ? TONS.cinza : TONS.ambar;
  const chave = p.situacao as SituacaoProtocolo;
  return TONS[SITUACAO_TOM[chave] ?? "cinza"] ?? TONS.cinza;
}

const FACETAS: Faceta<ProtocoloAberto>[] = [
  { chave: "usina", label: "Usina", valor: (p) => p.plantNome },
  { chave: "situacao", label: "Situação na RGE", valor: (p) => rotuloSituacao(p) },
  {
    chave: "concessionaria",
    label: "Concessionária",
    valor: (p) => p.concessionaria,
    semColuna: true,
  },
  {
    chave: "conferencia",
    label: "Exige conferência",
    valor: (p) => (p.precisaConferencia ? "Sim" : "Não"),
    semColuna: true,
  },
];

function BotaoCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title="Copiar só os dígitos — é a forma que o portal aceita"
      onClick={() => {
        navigator.clipboard.writeText(valor).then(
          () => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          },
          () => undefined,
        );
      }}
      className="ml-1.5 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
    >
      {copiado ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function ProtocolosEmAberto() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    fetch("/api/rateios/protocolos")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Falha ao carregar");
        return r.json();
      })
      .then((d: Resposta) => {
        if (!cancelado) setDados(d);
      })
      .catch((e: Error) => {
        if (!cancelado) setErro(e.message);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const protocolos = useMemo(() => dados?.protocolos ?? [], [dados]);

  const filtro = useFiltroTabela(protocolos, {
    sincronizarUrl: true,
    prefixoUrl: "prot_",
    // A busca varre as UCs junto: é o que permite chegar pelo número da UC e
    // descobrir em qual protocolo ela está, que é metade do uso desta tela.
    busca: (p) => [
      p.protocolo,
      p.protocoloDigitos,
      p.plantNome,
      p.plantUc,
      p.concessionaria,
      ...p.ucs.map((u) => u.nome),
      ...p.ucs.map((u) => u.codigoUc),
      ...p.ucs.map((u) => u.codigoUcAntigo),
    ],
    facetas: FACETAS,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando protocolos...
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{erro}</CardContent>
      </Card>
    );
  }

  const resumo = dados?.resumo;
  const semProtocolo = dados?.semProtocolo ?? [];

  return (
    <div className="space-y-3">
      {resumo && resumo.precisamConferencia > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>
              {resumo.precisamConferencia}{" "}
              {resumo.precisamConferencia === 1 ? "pedido" : "pedidos"} que a RGE
              já concluiu
            </b>{" "}
            e continuam pendentes aqui. O aceite automático está desligado de
            propósito: a RGE marca o pedido como concluído semanas antes de
            aplicar o rateio na fatura. Confira que as UCs que saem pararam de
            compensar e aceite na aba <b>Por usina</b>.
          </span>
        </div>
      )}

      {semProtocolo.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>
                {semProtocolo.length}{" "}
                {semProtocolo.length === 1
                  ? "rateio pendente SEM número de protocolo"
                  : "rateios pendentes SEM número de protocolo"}
              </b>{" "}
              — não dá para consultar nem acompanhar até alguém registrar o
              número devolvido pela concessionária.
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {semProtocolo.map((r) => (
                  <Link
                    key={r.rateioId}
                    href={`/admin/gestao-creditos/rateios?plantId=${r.plantId}`}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    {r.plantNome} ({r.diasEmAberto}d)
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-3">
          <FiltrosTabela
            filtro={filtro}
            placeholder="Buscar por protocolo, usina, UC ou nome do consumidor..."
            substantivo="protocolos"
            exportar={{
              tabela: "protocolos-abertos",
              nome: "protocolos-em-aberto",
              aba: "Protocolos",
            }}
          />

          {resumo && (
            <p className="text-xs text-muted-foreground">
              {resumo.emAberto} em aberto · {resumo.ucsEnvolvidas} UCs envolvidas
              {resumo.nuncaConsultados > 0
                ? ` · ${resumo.nuncaConsultados} nunca consultados`
                : ""}
              {resumo.semCredencial > 0
                ? ` · ${resumo.semCredencial} sem login da RGE na usina`
                : ""}
              {resumo.numeroInvalido > 0
                ? ` · ${resumo.numeroInvalido} com número fora do formato de pedido`
                : ""}
            </p>
          )}

          {filtro.filtrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {protocolos.length === 0
                ? "Nenhum protocolo em aberto — todo rateio pendente já foi resolvido."
                : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-tabela="protocolos-abertos">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Protocolo (nº do pedido)
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Usina
                      <FiltroColuna filtro={filtro} chave="usina" />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Unidades consumidoras
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide">
                      Em aberto
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Situação na RGE
                      <FiltroColuna filtro={filtro} chave="situacao" />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Registrado em
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Vigente a partir de
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtro.filtrados.map((p) => {
                    const aberto = !!abertos[p.rateioId];
                    const codigos = p.ucs
                      .map((u) => (u.codigoUc ? formatCodigoUc(u.codigoUc) : u.nome))
                      .join(", ");
                    return (
                      <Fragment key={p.rateioId}>
                        <tr
                          key={p.rateioId}
                          className={`border-b transition-colors last:border-0 hover:bg-muted/30 ${
                            p.precisaConferencia ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
                          }`}
                        >
                          <td className="px-3 py-2 align-top">
                            <span className="font-mono text-xs font-medium">
                              {p.protocolo}
                            </span>
                            {p.protocoloDigitos && (
                              <BotaoCopiar valor={p.protocoloDigitos} />
                            )}
                            {!p.consultavel && (
                              <span
                                className="ml-1 text-amber-600 dark:text-amber-500"
                                title="Fora do formato de um número de pedido (8 a 14 dígitos) — o robô não consegue consultar"
                              >
                                ⚠
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Link
                              href={`/admin/gestao-creditos/rateios?plantId=${p.plantId}`}
                              className="font-medium underline-offset-2 hover:underline"
                            >
                              {p.plantNome}
                            </Link>
                            {p.plantCidade && (
                              <span className="block text-xs text-muted-foreground">
                                {p.plantCidade}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <button
                              type="button"
                              onClick={() =>
                                setAbertos((s) => ({
                                  ...s,
                                  [p.rateioId]: !s[p.rateioId],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                            >
                              {aberto ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              {p.totalUcs} {p.totalUcs === 1 ? "UC" : "UCs"} ·{" "}
                              {pct(p.somaPercentual)}
                            </button>
                            {/* Os códigos viajam na planilha mesmo com a linha
                                fechada: quem exporta quer a lista inteira. */}
                            <span className="sr-only">{codigos}</span>
                          </td>
                          <td
                            className="px-3 py-2 text-right align-top tabular-nums"
                            data-export-valor={String(p.diasEmAberto)}
                          >
                            {p.diasEmAberto} d
                          </td>
                          <td className={`px-3 py-2 align-top text-xs ${tomSituacao(p)}`}>
                            {p.precisaConferencia ? "⚠ " : ""}
                            {rotuloSituacao(p)}
                            {p.consultadoEm && (
                              <span className="block font-normal text-muted-foreground">
                                consultado em {dataBr(p.consultadoEm)}
                              </span>
                            )}
                            {p.situacao === "ERRO" && p.erro && (
                              <span className="block font-normal">{p.erro}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                            {dataBr(p.criadoEm)}
                          </td>
                          <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                            {dataBr(p.vigenteAPartirDe)}
                          </td>
                        </tr>

                        {aberto && (
                          <tr key={`${p.rateioId}-ucs`} data-export="ignorar">
                            <td colSpan={7} className="bg-muted/40 px-3 py-2">
                              <div className="space-y-1">
                                {p.ucs.map((u) => (
                                  <div
                                    key={u.id}
                                    className="flex flex-wrap items-baseline gap-x-2 text-xs"
                                  >
                                    <span className="font-mono">
                                      {u.codigoUc ? formatCodigoUc(u.codigoUc) : "—"}
                                    </span>
                                    <span className="font-medium">{u.nome}</span>
                                    {u.cidade && (
                                      <span className="text-muted-foreground">
                                        {u.cidade}
                                      </span>
                                    )}
                                    {u.codigoUcAntigo && (
                                      <span className="text-muted-foreground">
                                        (antigo {formatCodigoUc(u.codigoUcAntigo)})
                                      </span>
                                    )}
                                    <span className="ml-auto font-medium tabular-nums">
                                      {pct(u.percentual)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
