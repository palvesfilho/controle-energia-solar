import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  KeyRound,
  PlugZap,
  PowerOff,
  ShieldAlert,
  TrendingDown,
  TriangleAlert,
  UserPlus,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { BotaoRegistrarContato } from "@/components/acoes-diarias/botao-registrar-contato";
import { cn } from "@/lib/utils";
import {
  DIAS_CONTATOS,
  getAcoesDiarias,
  type EstadoItem,
  type FilaAcao,
  type FilaAcaoKey,
  type ItemAcao,
} from "@/lib/acoes-diarias";

/**
 * Ações Diárias — entrada do pós-venda no módulo Brasil Solar.
 *
 * Mesmo desenho do Painel do Dia da Associação: pastas à esquerda (uma por
 * fila, com contador), tabela da fila escolhida à direita. Cada linha leva à
 * usina ou ao cliente e aceita o registro do contato feito. Toda a regra mora
 * em `lib/acoes-diarias.ts`.
 *
 * A fila e o filtro vivem na URL (`?fila=…&so=…`).
 */

const ICONE_FILA: Record<FilaAcaoKey, LucideIcon> = {
  PAROU_RECENTE: PowerOff,
  PARADA_LONGA: WifiOff,
  ERRO_INVERSOR: ShieldAlert,
  BAIXA_GERACAO: TrendingDown,
  OUTROS_ALERTAS: TriangleAlert,
  NUNCA_COMUNICOU: PlugZap,
  ACESSO_PORTAL: KeyRound,
  SEM_CLIENTE: UserPlus,
};

const SELO_ESTADO: Record<EstadoItem, { rotulo: string; classe: string }> = {
  novo: { rotulo: "A fazer", classe: "bg-amber-100 text-amber-800" },
  andamento: { rotulo: "Em andamento", classe: "bg-sky-100 text-sky-800" },
};

const FILTROS: Array<{ key: EstadoItem | null; rotulo: string }> = [
  { key: null, rotulo: "Todas" },
  { key: "novo", rotulo: "A fazer" },
  { key: "andamento", rotulo: "Em andamento" },
];

interface AcoesDiariasPageProps {
  searchParams: Promise<{ fila?: string; so?: string }>;
}

const n = (v: number) => v.toLocaleString("pt-BR");

export default async function AcoesDiariasPage({ searchParams }: AcoesDiariasPageProps) {
  const [acoes, params] = await Promise.all([getAcoesDiarias(), searchParams]);
  const { indicadores: ind, filas } = acoes;

  // Sem escolha na URL, abre na primeira fila com algo a fazer.
  const fila =
    filas.find((f) => f.key === params.fila) ??
    filas.find((f) => f.novos > 0) ??
    filas.find((f) => f.total > 0) ??
    filas[0];
  const so = FILTROS.find((f) => f.key !== null && f.key === params.so)?.key ?? null;
  const linhas = so ? fila.itens.filter((i) => i.estado === so) : fila.itens;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ações Diárias</h1>
        <p className="text-sm text-muted-foreground">
          Pós-venda Brasil Solar · {acoes.hoje}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Contador
          rotulo="Usinas comunicando"
          valor={`${n(ind.usinasComunicando)} de ${n(ind.usinasAtivas)}`}
          detalhe={`${n(ind.usinasParadas)} paradas · ${n(ind.usinasSemDados)} sem dados`}
          tom={ind.usinasParadas > 0 ? "amber" : "green"}
        />
        <Contador
          rotulo="Alertas abertos"
          valor={n(ind.alertasAbertos)}
          detalhe={`${n(ind.alertasSemTratamento)} ainda sem nenhum contato`}
          tom={ind.alertasSemTratamento > 0 ? "red" : "green"}
        />
        <Contador
          rotulo="Clientes no portal"
          valor={`${n(ind.clientesComLogin)} de ${n(ind.clientesCadastrados)}`}
          detalhe={`${n(ind.clientesComAvisoNoCelular)} com aviso no celular · ${n(ind.usinasSemCliente)} usinas sem cliente cadastrado`}
          tom={ind.usinasSemCliente > 0 ? "amber" : "slate"}
        />
        <Contador
          rotulo="Contatos hoje"
          valor={n(ind.contatosHoje)}
          detalhe={`${n(ind.contatosJanela)} nos últimos ${DIAS_CONTATOS} dias`}
          tom="slate"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
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

        <Card className="min-w-0">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{fila.titulo}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{fila.instrucao}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{n(fila.total)}</div>
                <div className="text-sm text-muted-foreground">{n(fila.novos)} a fazer</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Base: {fila.base}</p>

            <details className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                <CircleHelp className="h-4 w-4 text-primary" />
                Como tratar esta fila
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                {fila.passos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </details>

            {fila.aviso && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {fila.aviso}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                // Sobre a fila inteira, não só sobre as linhas desenhadas.
                const qtd =
                  f.key === null
                    ? fila.total
                    : f.key === "novo"
                      ? fila.novos
                      : fila.total - fila.novos;
                return (
                  <Link
                    key={f.rotulo}
                    href={hrefAcoes(fila.key, f.key)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      so === f.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {f.rotulo} <span className="tabular-nums opacity-80">{n(qtd)}</span>
                  </Link>
                );
              })}
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
                      <th className="px-3 py-2 font-medium">Usina / cliente</th>
                      <th className="px-3 py-2 font-medium">Telefone</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">{fila.rotuloData}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((i) => (
                      <LinhaFila key={i.id} item={i} />
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

function hrefAcoes(fila: FilaAcaoKey, so: EstadoItem | null): string {
  return `/admin/brasil-solar/acoes-diarias?fila=${fila}${so ? `&so=${so}` : ""}`;
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
  valor: string;
  detalhe: string;
  tom: keyof typeof TOM_CONTADOR;
}) {
  return (
    <div className={cn("rounded-xl border p-4", TOM_CONTADOR[tom])}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{rotulo}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{valor}</div>
      <div className="mt-1 text-xs opacity-80">{detalhe}</div>
    </div>
  );
}

function PastaFila({ fila, ativa }: { fila: FilaAcao; ativa: boolean }) {
  const Icone = ICONE_FILA[fila.key];
  return (
    <Link
      href={hrefAcoes(fila.key, null)}
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
          title={`${n(fila.novos)} a fazer`}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            fila.novos > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700",
          )}
        >
          {n(fila.total)}
        </span>
      )}
    </Link>
  );
}

function LinhaFila({ item }: { item: ItemAcao }) {
  const selo = SELO_ESTADO[item.estado];
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
        {item.ultimoContato && (
          <div className="text-xs text-sky-800">Último contato: {item.ultimoContato}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
        {item.telefone ?? <span className="text-muted-foreground">sem telefone</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.data ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          {item.alvo && (
            <BotaoRegistrarContato nome={item.titulo} telefone={item.telefone} alvo={item.alvo} />
          )}
          <Link
            href={item.href}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
          >
            Abrir
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
