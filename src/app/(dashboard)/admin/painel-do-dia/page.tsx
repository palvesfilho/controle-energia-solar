import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  Gauge,
  HandCoins,
  PieChart,
  Receipt,
  Repeat,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/formatters";
import { parseDateOnlyISO } from "@/lib/date-only";
import {
  DIAS_NOVIDADES,
  getPainelDoDia,
  rotuloSemana,
  SEMANAS_ATRAS,
  type Fila,
  type FilaItem,
  type FilaKey,
  type TomItem,
} from "@/lib/painel-do-dia";

/**
 * Painel do Dia — entrada do módulo Associação.
 *
 * Pastas à esquerda (uma por fila, com contador), tabela completa da fila
 * escolhida à direita. Não tem ação própria: cada linha leva à tela onde o
 * trabalho é feito. Toda a regra mora em `lib/painel-do-dia.ts`.
 *
 * A fila e o filtro vivem na URL (`?fila=…&so=…`), então dá para mandar o link
 * de uma fila para alguém e o voltar do navegador funciona.
 */

const ICONE_FILA: Record<FilaKey, LucideIcon> = {
  PAGAR_FATURA: Banknote,
  INFORMAR_LEITURA: Gauge,
  ACEITE_TRANSFERENCIA: Repeat,
  ACEITE_RATEIO: PieChart,
  EMITIR_COBRANCA: Receipt,
  INADIMPLENTES: UserX,
  EMITIR_RELATORIO: FileBarChart,
  PAGAR_INVESTIDOR: HandCoins,
  CONFERIR_PAGAMENTO: ClipboardCheck,
};

/** O verbo do botão de cada linha — diz o que se vai fazer na tela de destino. */
const ACAO_FILA: Record<FilaKey, string> = {
  PAGAR_FATURA: "Pagar",
  INFORMAR_LEITURA: "Informar",
  ACEITE_TRANSFERENCIA: "Conferir",
  ACEITE_RATEIO: "Conferir",
  EMITIR_COBRANCA: "Emitir",
  INADIMPLENTES: "Cobrar",
  EMITIR_RELATORIO: "Emitir",
  PAGAR_INVESTIDOR: "Pagar",
  CONFERIR_PAGAMENTO: "Conferir",
};

const SELO_TOM: Record<TomItem, { rotulo: string; classe: string }> = {
  atrasado: { rotulo: "Em atraso", classe: "bg-red-100 text-red-700" },
  hoje: { rotulo: "Para hoje", classe: "bg-amber-100 text-amber-800" },
  normal: { rotulo: "Em aberto", classe: "bg-slate-100 text-slate-600" },
};

const FILTROS: Array<{ key: TomItem | null; rotulo: string }> = [
  { key: null, rotulo: "Todas" },
  { key: "atrasado", rotulo: "Em atraso" },
  { key: "hoje", rotulo: "Para hoje" },
  { key: "normal", rotulo: "Em aberto" },
];

interface PainelDoDiaPageProps {
  searchParams: Promise<{ fila?: string; so?: string }>;
}

export default async function PainelDoDiaPage({ searchParams }: PainelDoDiaPageProps) {
  const [painel, params] = await Promise.all([getPainelDoDia(), searchParams]);
  const { resumo, filas } = painel;
  const hoje = parseDateOnlyISO(painel.hoje)!;
  const inicio = parseDateOnlyISO(painel.semanaInicio)!;
  const fim = parseDateOnlyISO(painel.semanaFim)!;

  const diaExtenso = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(hoje);

  // Sem escolha na URL, abre na primeira fila com atraso; sem atraso, na
  // primeira com trabalho.
  const fila =
    filas.find((f) => f.key === params.fila) ??
    filas.find((f) => f.atrasados > 0) ??
    filas.find((f) => f.total > 0) ??
    filas[0];
  const so = FILTROS.find((f) => f.key !== null && f.key === params.so)?.key ?? null;
  const linhas = so ? fila.itens.filter((i) => i.tom === so) : fila.itens;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel do Dia</h1>
          <p className="text-sm text-muted-foreground">
            <span className="capitalize">{diaExtenso}</span> · semana de {rotuloSemana(inicio, fim)}
          </p>
        </div>
        <Link
          href="/admin/agenda"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <CalendarClock className="h-4 w-4" />
          Abrir a Agenda da Semana
        </Link>
      </div>

      {/* Tarefas com data — as mesmas da Agenda da Semana */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Contador
          rotulo="Atrasadas"
          valor={resumo.atrasadas}
          detalhe={`desta semana e das ${SEMANAS_ATRAS} anteriores`}
          tom={resumo.atrasadas > 0 ? "red" : "green"}
        />
        <Contador
          rotulo="Para hoje"
          valor={resumo.paraHoje}
          detalhe="tarefas agendadas para hoje"
          tom={resumo.paraHoje > 0 ? "amber" : "slate"}
        />
        <Contador
          rotulo="Resto da semana"
          valor={resumo.restoDaSemana}
          detalhe={
            resumo.aPagarNaSemana > 0
              ? `${formatBRL(resumo.aPagarNaSemana)} em contas a pagar`
              : "de amanhã até domingo"
          }
          tom="slate"
        />
        <Contador
          rotulo="Feitas na semana"
          valor={resumo.feitasNaSemana}
          detalhe={`de ${resumo.totalDaSemana} tarefas da semana`}
          tom="green"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-2">
              <h2 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                Filas de trabalho
              </h2>
              <nav className="space-y-0.5">
                {filas.map((f) => (
                  <PastaFila key={f.key} fila={f} ativa={f.key === fila.key} />
                ))}
              </nav>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Novidades</th>
                    <th className="px-2 py-2 text-right font-medium">Hoje</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {DIAS_NOVIDADES} dias
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {painel.novidades.map((n) => (
                    <tr key={n.titulo} className="border-b last:border-0">
                      <td className="px-3 py-1.5">
                        <Link href={n.href} className="hover:underline">
                          {n.titulo}
                        </Link>
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right tabular-nums",
                          n.hoje > 0 ? "font-semibold" : "text-muted-foreground",
                        )}
                      >
                        {n.hoje}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          n.semana > 0 ? "font-semibold" : "text-muted-foreground",
                        )}
                      >
                        {n.semana}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{fila.titulo}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{fila.instrucao}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{fila.total}</div>
                {fila.valor != null && fila.valor > 0 && (
                  <div className="text-sm text-muted-foreground">{formatBRL(fila.valor)}</div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Base: {fila.base}</p>

            {fila.aviso && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {fila.aviso}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTROS.map((f) => {
                  const qtd = f.key
                    ? fila.itens.filter((i) => i.tom === f.key).length
                    : fila.itens.length;
                  return (
                    <Link
                      key={f.rotulo}
                      href={hrefPainel(fila.key, f.key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        so === f.key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {f.rotulo} <span className="tabular-nums opacity-80">{qtd}</span>
                    </Link>
                  );
                })}
              </div>
              <Link
                href={fila.href}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Abrir a tela de trabalho
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {linhas.length === 0 ? (
              <p className="flex items-center gap-2 rounded-md border px-3 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {fila.total === 0 ? "Sem pendência nesta fila." : "Nada neste filtro."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Situação</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">{fila.rotuloData}</th>
                      <th className="px-3 py-2 text-right font-medium">Valor</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((i) => (
                      <LinhaFila key={i.id} item={i} acao={ACAO_FILA[fila.key]} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function hrefPainel(fila: FilaKey, so: TomItem | null): string {
  return `/admin/painel-do-dia?fila=${fila}${so ? `&so=${so}` : ""}`;
}

const TOM_CONTADOR = {
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  green: "border-green-200 bg-green-50 text-green-700",
  slate: "border-slate-200 bg-white text-slate-800",
} as const;

function Contador({
  rotulo,
  valor,
  detalhe,
  tom,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  tom: keyof typeof TOM_CONTADOR;
}) {
  return (
    <div className={cn("rounded-xl border p-4", TOM_CONTADOR[tom])}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{rotulo}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{valor}</div>
      <div className="mt-1 text-xs opacity-80">{detalhe}</div>
    </div>
  );
}

function PastaFila({ fila, ativa }: { fila: Fila; ativa: boolean }) {
  const Icone = ICONE_FILA[fila.key];
  return (
    <Link
      href={hrefPainel(fila.key, null)}
      aria-current={ativa ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm",
        ativa ? "bg-primary/10 font-semibold text-primary" : "hover:bg-slate-50",
        !ativa && fila.total === 0 && "text-muted-foreground",
      )}
    >
      <Icone className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 leading-tight">{fila.titulo}</span>
      {fila.total === 0 ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <span
          title={fila.atrasados > 0 ? `${fila.atrasados} em atraso` : undefined}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            fila.atrasados > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700",
          )}
        >
          {fila.total}
        </span>
      )}
    </Link>
  );
}

function LinhaFila({ item, acao }: { item: FilaItem; acao: string }) {
  const selo = SELO_TOM[item.tom];
  return (
    <tr className="border-b last:border-0 hover:bg-slate-50">
      <td className="px-3 py-2">
        <span
          className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", selo.classe)}
        >
          {selo.rotulo}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="font-medium">{item.titulo}</div>
        {item.detalhe && <div className="text-xs text-muted-foreground">{item.detalhe}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.data ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {item.valor != null ? formatBRL(item.valor) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={item.href}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
        >
          {acao}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}
