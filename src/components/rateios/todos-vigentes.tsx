"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { FiltrosTabela } from "@/components/ui/filtros-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";
import { useFiltroTabela, type Faceta } from "@/lib/filtro-tabela";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { formatCpfCnpj } from "@/lib/documento";
import {
  SITUACAO_LABEL,
  SITUACAO_TOM,
  type SituacaoProtocolo,
} from "@/lib/rge-protocolo";

/**
 * Aba "Todos os vigentes": o rateio VIGENTE de todas as usinas numa lista só,
 * em ordem alfabética, uma linha por UC.
 *
 * A tela por usina responde "como está esta usina". Esta responde "como está o
 * parque" — que é outra pergunta, e é a que não tinha onde ser feita: para
 * conferir 30 usinas era preciso trocar o seletor 30 vezes, e nada cruzava.
 *
 * A linha é a UC de propósito: é nela que mora o percentual, e é nela que mora
 * o erro que vale achar.
 */

type LinhaVigente = {
  plantId: string;
  plantNome: string;
  plantCidade: string | null;
  plantUc: string | null;
  potenciaInstalada: number | null;
  concessionaria: string | null;
  rateioId: string;
  protocolo: string | null;
  protocoloSituacao: string | null;
  protocoloStatusRge: string | null;
  vigenteAPartirDe: string;
  somaPercentual: number;
  somaFecha: boolean;
  totalUcs: number;
  ucId: string;
  ucNome: string;
  codigoUc: string | null;
  codigoUcAntigo: string | null;
  ucCpfCnpj: string | null;
  ucCidade: string | null;
  ucAtiva: boolean;
  percentual: number;
  isGeradora: boolean;
};

type SemRateio = {
  plantId: string;
  plantNome: string;
  plantCidade: string | null;
  concessionaria: string | null;
};

type Resposta = {
  linhas: LinhaVigente[];
  semRateio: SemRateio[];
  resumo: {
    usinasComRateio: number;
    usinasSemRateio: number;
    ucs: number;
    usinasSomaNaoFecha: number;
    semProtocolo: number;
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
 * Rótulo da situação do protocolo. Situação que a nossa tabela não conhece cai
 * no literal que a RGE devolveu — nunca num palpite: é o literal que permite
 * corrigir a tabela depois.
 */
function rotuloSituacao(l: LinhaVigente): string {
  if (!l.protocolo) return "Sem protocolo";
  if (!l.protocoloSituacao) return "Aguardando consulta";
  const chave = l.protocoloSituacao as SituacaoProtocolo;
  return (
    SITUACAO_LABEL[chave] ??
    (l.protocoloStatusRge ? `RGE: "${l.protocoloStatusRge}"` : l.protocoloSituacao)
  );
}

function tomSituacao(l: LinhaVigente): string {
  if (!l.protocolo) return TONS.ambar;
  if (!l.protocoloSituacao) return TONS.cinza;
  const chave = l.protocoloSituacao as SituacaoProtocolo;
  return TONS[SITUACAO_TOM[chave] ?? "cinza"] ?? TONS.cinza;
}

const FACETAS: Faceta<LinhaVigente>[] = [
  { chave: "usina", label: "Usina", valor: (l) => l.plantNome },
  { chave: "cidadeUc", label: "Cidade da UC", valor: (l) => l.ucCidade },
  {
    chave: "concessionaria",
    label: "Concessionária",
    valor: (l) => l.concessionaria,
    semColuna: true,
  },
  {
    chave: "situacao",
    label: "Protocolo na RGE",
    valor: (l) => rotuloSituacao(l),
  },
  {
    // Sem coluna própria: o aviso aparece na faixa da usina, não na linha da
    // UC. O funil fica na barra para dar o recorte "me mostre só o que não
    // fecha" sem precisar varrer a lista com o olho.
    chave: "somaFecha",
    label: "Soma 100%",
    valor: (l) => (l.somaFecha ? "Fecha 100%" : "Não fecha"),
    semColuna: true,
  },
];

export function TodosOsVigentes() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    fetch("/api/rateios/vigentes")
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

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);

  const filtro = useFiltroTabela(linhas, {
    sincronizarUrl: true,
    // Prefixo porque a aba de protocolos tem a própria tabela e os dois filtros
    // dividem a mesma query string.
    prefixoUrl: "vig_",
    busca: (l) => [
      l.plantNome,
      l.ucNome,
      l.codigoUc,
      l.codigoUcAntigo,
      l.ucCpfCnpj,
      l.protocolo,
      l.ucCidade,
    ],
    facetas: FACETAS,
  });

  /**
   * Agrupa por usina para a faixa de cabeçalho. As linhas já vêm da API em
   * ordem alfabética e o filtro preserva a ordem, então basta quebrar quando o
   * `plantId` muda.
   *
   * Os números da faixa (nº de UCs e soma) são os do RATEIO INTEIRO, não os do
   * que sobrou no filtro: uma soma "43%" porque o filtro escondeu três UCs
   * seria uma acusação falsa.
   */
  const grupos = useMemo(() => {
    const out: Array<{ cabeca: LinhaVigente; linhas: LinhaVigente[] }> = [];
    for (const l of filtro.filtrados) {
      const ultimo = out[out.length - 1];
      if (!ultimo || ultimo.cabeca.plantId !== l.plantId) {
        out.push({ cabeca: l, linhas: [l] });
      } else {
        ultimo.linhas.push(l);
      }
    }
    return out;
  }, [filtro.filtrados]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando rateios de todas as
        usinas...
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
  const semRateio = dados?.semRateio ?? [];

  return (
    <div className="space-y-3">
      {/* Os dois buracos que esta lista existe para revelar. Só aparecem
          quando existem — aviso que aparece sempre vira paisagem. */}
      {resumo && resumo.usinasSomaNaoFecha > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>
              {resumo.usinasSomaNaoFecha}{" "}
              {resumo.usinasSomaNaoFecha === 1 ? "usina" : "usinas"}
            </b>{" "}
            com a soma dos percentuais fora de 100% — há crédito sobrando ou
            faltando. Use o funil <b>Soma 100%</b> na barra para ver só elas.
          </span>
        </div>
      )}

      {semRateio.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>
                {semRateio.length}{" "}
                {semRateio.length === 1
                  ? "usina ativa sem rateio vigente"
                  : "usinas ativas sem rateio vigente"}
              </b>{" "}
              — nenhum crédito está sendo distribuído por elas.
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {semRateio.map((p) => (
                  <Link
                    key={p.plantId}
                    href={`/admin/gestao-creditos/rateios?plantId=${p.plantId}`}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    {p.plantNome}
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
            placeholder="Buscar por usina, UC, nome, CPF/CNPJ ou protocolo..."
            substantivo="UCs"
            exportar={{
              tabela: "rateios-vigentes",
              nome: "rateios-vigentes",
              aba: "Rateios vigentes",
            }}
          />

          {resumo && (
            <p className="text-xs text-muted-foreground">
              {resumo.usinasComRateio} usinas com rateio vigente ·{" "}
              {resumo.ucs} UCs atendidas
              {resumo.semProtocolo > 0
                ? ` · ${resumo.semProtocolo} sem protocolo registrado`
                : ""}
            </p>
          )}

          {grupos.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {linhas.length === 0
                ? "Nenhuma usina ativa tem rateio vigente."
                : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-tabela="rateios-vigentes">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Usina
                      <FiltroColuna filtro={filtro} chave="usina" />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      UC
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Unidade consumidora
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      CPF/CNPJ
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Cidade
                      <FiltroColuna filtro={filtro} chave="cidadeUc" />
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide">
                      Percentual
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Protocolo
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Situação na RGE
                      <FiltroColuna filtro={filtro} chave="situacao" />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                      Vigente desde
                    </th>
                  </tr>
                </thead>

                {grupos.map(({ cabeca, linhas: doGrupo }) => (
                  <tbody key={cabeca.plantId}>
                    {/* Faixa da usina: os números do rateio inteiro. Fora do
                        Excel de propósito — a planilha sai plana, uma linha
                        por UC, e a usina vai na coluna de cada linha. */}
                    <tr data-export="ignorar" className="bg-muted/50">
                      <td colSpan={9} className="px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <Link
                            href={`/admin/gestao-creditos/rateios?plantId=${cabeca.plantId}`}
                            className="text-sm font-semibold underline-offset-2 hover:underline"
                          >
                            {cabeca.plantNome}
                          </Link>
                          {cabeca.plantCidade && (
                            <span className="text-muted-foreground">
                              · {cabeca.plantCidade}
                            </span>
                          )}
                          {cabeca.potenciaInstalada ? (
                            <span className="text-muted-foreground">
                              ·{" "}
                              {cabeca.potenciaInstalada.toLocaleString("pt-BR")} kWp
                            </span>
                          ) : null}
                          <span className="text-muted-foreground">
                            ·{" "}
                            {doGrupo.length < cabeca.totalUcs
                              ? `${doGrupo.length} de ${cabeca.totalUcs} UCs`
                              : `${cabeca.totalUcs} ${cabeca.totalUcs === 1 ? "UC" : "UCs"}`}
                          </span>
                          <span
                            className={
                              cabeca.somaFecha
                                ? "font-medium text-muted-foreground"
                                : "font-semibold text-amber-600 dark:text-amber-500"
                            }
                          >
                            · {pct(cabeca.somaPercentual)}
                            {cabeca.somaFecha ? "" : " ⚠ não fecha 100%"}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {doGrupo.map((l, i) => (
                      <tr
                        key={l.ucId}
                        className="border-b transition-colors last:border-0 hover:bg-muted/30"
                      >
                        {/* O nome da usina vai em TODA linha, para a planilha
                            exportada sair completa. Na tela ele só aparece na
                            primeira do grupo (a faixa acima já o anuncia); nas
                            demais fica como texto de leitor de tela, que o
                            Exportar continua enxergando. */}
                        <td className="px-3 py-2 align-top">
                          {i === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {l.plantNome}
                            </span>
                          ) : (
                            <span className="sr-only">{l.plantNome}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          {l.codigoUc ? formatCodigoUc(l.codigoUc) : "—"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className={l.ucAtiva ? "" : "text-muted-foreground"}>
                            {l.ucNome}
                          </span>
                          {l.isGeradora && (
                            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                              geradora
                            </span>
                          )}
                          {!l.ucAtiva && (
                            <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-700 dark:bg-red-950 dark:text-red-300">
                              inativa
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {l.ucCpfCnpj ? formatCpfCnpj(l.ucCpfCnpj) : "—"}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {l.ucCidade ?? "—"}
                        </td>
                        <td
                          className="px-3 py-2 text-right align-top font-medium tabular-nums"
                          data-export-valor={String(l.percentual)}
                        >
                          {pct(l.percentual)}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs">
                          {l.protocolo ?? (
                            <span className="font-sans text-amber-600 dark:text-amber-500">
                              sem protocolo
                            </span>
                          )}
                        </td>
                        <td className={`px-3 py-2 align-top text-xs ${tomSituacao(l)}`}>
                          {rotuloSituacao(l)}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                          {dataBr(l.vigenteAPartirDe)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
