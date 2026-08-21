"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Search,
  ArrowUpDown,
  Factory,
  CheckCircle2,
  Zap,
  HardHat,
  AlertTriangle,
} from "lucide-react";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { matchBusca } from "@/lib/busca";
import {
  type FaseImplantacao,
  type FaseUc,
  CICLOS_ATENCAO,
  formatCompetencia,
} from "@/lib/uc-implantacao";
import { AvisoPrimeirasCompensacoes } from "@/components/consumer-units/aviso-primeiras-compensacoes";

interface UCData {
  id: string;
  nome: string;
  codigoUc: string;
  cpfCnpj: string | null;
  distribuidora: string | null;
  grupo: string | null;
  modalidade: string | null;
  consumoMedio: number | null;
  cidade: string | null;
  statusContrato: string | null;
  active: boolean;
  consumer: { id: string; name: string } | null;
  plant: { id: string; name: string } | null;
  /** Fase derivada das faturas — ver lib/uc-implantacao.ts. */
  implantacao: FaseImplantacao | null;
}

type SortKey = "nome" | "codigoUc" | "consumo" | "status" | "espera";
type SortDir = "asc" | "desc";

/**
 * Aba da lista. A separação existe porque as duas fases exigem trabalhos
 * diferentes: a UC em implantação se cobra da distribuidora, a que já compensa
 * se cobra do cliente. Misturadas, as 26 que ainda esperam somem no meio das
 * que já faturam e ninguém percebe a que travou.
 */
type Aba = "faturando" | "implantacao" | "todas";

const ABAS: { key: Aba; label: string; hint: string }[] = [
  {
    key: "faturando",
    label: "Faturando",
    hint: "Já tiveram compensação na fatura — é o que se cobra",
  },
  {
    key: "implantacao",
    label: "Em implantação",
    hint: "Contrato fechado, desconto ainda não apareceu na conta",
  },
  { key: "todas", label: "Todas", hint: "As duas fases juntas" },
];

export default function UnidadesConsumidorasPage() {
  // `useSearchParams` exige fronteira de Suspense — sem ela o build reclama na
  // pré-renderização desta rota.
  return (
    <Suspense
      fallback={<div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>}
    >
      <UnidadesConsumidorasConteudo />
    </Suspense>
  );
}

function UnidadesConsumidorasConteudo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ucs, setUcs] = useState<UCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDistribuidora, setFilterDistribuidora] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [recarregar, setRecarregar] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "nome", dir: "asc" });

  // A aba mora na URL, não em estado local: é assim que o link do sino
  // (?fase=implantacao) e o botão voltar do navegador funcionam sem um efeito
  // sincronizando as duas fontes — que é justamente onde esse tipo de tela
  // costuma passar a piscar a aba errada por um render.
  const faseUrl = searchParams.get("fase");
  const aba: Aba =
    faseUrl === "implantacao" || faseUrl === "todas" || faseUrl === "faturando"
      ? faseUrl
      : "faturando";
  const soNovas = searchParams.get("novas") === "1";

  const irPara = useCallback(
    (nova: Aba, apenasNovas = false) => {
      const p = new URLSearchParams();
      if (nova !== "faturando") p.set("fase", nova);
      if (apenasNovas) p.set("novas", "1");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams();
    if (filterDistribuidora) params.set("distribuidora", filterDistribuidora);
    if (filterStatus) params.set("status", filterStatus);

    fetch(`/api/consumer-units?${params.toString()}`)
      .then((res) => res.json())
      .then((d) => {
        if (!cancelado) setUcs(d);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [filterDistribuidora, filterStatus, recarregar]);

  const distribuidoras = useMemo(
    () => Array.from(new Set(ucs.map((u) => u.distribuidora).filter(Boolean))) as string[],
    [ucs]
  );

  const stats = useMemo(() => {
    // O KPI de "ativas" saiu daqui: com todas as UCs da tela ativas, ele não
    // decidia nada. Quem carrega informação agora é a FASE — é ela que separa
    // o que se cobra do que ainda se persegue na distribuidora. UC desativada
    // continua visível pelo selo "Inativa" na coluna de status.
    const consumoTotal = ucs.reduce((acc, u) => acc + (u.consumoMedio ?? 0), 0);
    const implantacao = ucs.filter((u) => u.implantacao?.fase === "IMPLANTACAO");
    return {
      total: ucs.length,
      consumoTotal,
      implantacao: implantacao.length,
      atrasadas: implantacao.filter((u) => u.implantacao?.alerta === "ATRASADA").length,
      faturando: ucs.filter((u) => u.implantacao?.fase === "FATURANDO").length,
      novas: ucs.filter((u) => u.implantacao?.aguardandoLiberacao).length,
    };
  }, [ucs]);

  const contagemAba = useCallback(
    (key: Aba) =>
      key === "todas"
        ? ucs.length
        : ucs.filter((u) => u.implantacao?.fase === faseDaAba(key)).length,
    [ucs]
  );

  const filtered = useMemo(() => {
    const rows = ucs.filter((u) => {
      if (aba !== "todas" && u.implantacao?.fase !== faseDaAba(aba)) return false;
      if (soNovas && !u.implantacao?.aguardandoLiberacao) return false;
      return matchBusca(search, [u.nome, u.codigoUc, u.consumer?.name, u.plant?.name]);
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "nome":
          return a.nome.localeCompare(b.nome) * dir;
        case "codigoUc":
          return a.codigoUc.localeCompare(b.codigoUc) * dir;
        case "consumo":
          return ((a.consumoMedio ?? 0) - (b.consumoMedio ?? 0)) * dir;
        case "espera":
          // Quem espera há mais tempo primeiro — é a UC que corre risco de ficar
          // esquecida, não a que acabou de entrar.
          return (
            ((a.implantacao?.ciclosEsperando ?? 0) - (b.implantacao?.ciclosEsperando ?? 0)) * dir
          );
        case "status":
          // Inativas juntas primeiro (ou por último), depois o texto do contrato.
          return (
            (((a.active ? 0 : 1) - (b.active ? 0 : 1)) ||
              (a.statusContrato ?? "").localeCompare(b.statusContrato ?? "")) * dir
          );
      }
    });
    return rows;
  }, [ucs, search, sort, aba, soNovas]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const emImplantacao = aba === "implantacao";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Unidades Consumidoras</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as UCs vinculadas a consumidores e usinas
          </p>
        </div>
        <Link
          href="/admin/unidades-consumidoras/nova"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova UC
        </Link>
      </div>

      {/* Some sozinho quando não há nada pendente — ver o componente. */}
      <AvisoPrimeirasCompensacoes
        onLiberada={() => setRecarregar((n) => n + 1)}
        mostrarLinkImplantacao={!emImplantacao}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Factory className="h-4 w-4" />} label="Total" value={stats.total} accent="blue" />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Faturando"
          value={stats.faturando}
          accent="emerald"
        />
        <StatCard
          icon={<HardHat className="h-4 w-4" />}
          label="Em implantação"
          value={stats.implantacao}
          accent="amber"
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Consumo médio total"
          value={`${stats.consumoTotal.toLocaleString("pt-BR")} kWh`}
          accent="zinc"
        />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          {/* Abas da fase. Ficam acima dos filtros de propósito: a fase decide
              QUAL trabalho está sendo feito, os filtros só recortam dentro dele. */}
          <div className="flex flex-wrap items-center gap-1 border-b pb-2">
            {ABAS.map((t) => {
              const ativa = aba === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => irPara(t.key)}
                  title={t.hint}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    ativa
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-xs ${ativa ? "opacity-80" : "opacity-60"}`}>
                    {contagemAba(t.key)}
                  </span>
                </button>
              );
            })}

            {stats.atrasadas > 0 && aba !== "implantacao" && (
              <button
                onClick={() => {
                  irPara("implantacao");
                  setSort({ key: "espera", dir: "desc" });
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-100"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {stats.atrasadas} esperando há {CICLOS_ATRASO_LABEL}
              </button>
            )}

            {soNovas && (
              <button
                onClick={() => irPara(aba)}
                className="ml-auto rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Só as novas ({stats.novas}) · limpar
              </button>
            )}
          </div>

          {emImplantacao && (
            <p className="text-xs text-muted-foreground">
              UCs com contrato de desconto que ainda não tiveram nenhuma fatura com
              energia compensada. Elas saem daqui sozinhas na primeira compensação —
              e você recebe o aviso para começar a cobrar.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, código, consumidor ou usina..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={filterDistribuidora}
              onChange={(e) => setFilterDistribuidora(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todas distribuidoras</option>
              {distribuidoras.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos status</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Pendente">Pendente</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} de {stats.total}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {ucs.length === 0
                ? "Nenhuma UC cadastrada."
                : emImplantacao
                  ? "Nenhuma UC em implantação — todas já tiveram compensação na fatura."
                  : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "nome"} dir={sort.dir} onClick={() => toggleSort("nome")} />
                    <SortHeader label="Código UC" active={sort.key === "codigoUc"} dir={sort.dir} onClick={() => toggleSort("codigoUc")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Consumidor</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                    {emImplantacao ? (
                      <>
                        <SortHeader
                          label="Esperando"
                          align="center"
                          active={sort.key === "espera"}
                          dir={sort.dir}
                          onClick={() => toggleSort("espera")}
                        />
                        <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                          Contas sem desconto
                        </th>
                        <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                          Última fatura
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                          Distribuidora
                        </th>
                        <SortHeader label="Consumo" align="right" active={sort.key === "consumo"} dir={sort.dir} onClick={() => toggleSort("consumo")} />
                        <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">
                          1ª compensação
                        </th>
                      </>
                    )}
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((uc) => (
                    <tr
                      key={uc.id}
                      className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                        uc.implantacao?.alerta === "ATRASADA"
                          ? "bg-red-50/60"
                          : uc.implantacao?.alerta === "ATENCAO"
                            ? "bg-amber-50/60"
                            : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-medium">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/admin/unidades-consumidoras/${uc.id}/editar`}
                            title="Editar"
                            className="text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                          >
                            {uc.nome}
                          </Link>
                          {/* Compensou e ninguém liberou a cobrança ainda. O selo
                              fica até alguém agir — a UC não pode estrear o
                              desconto e passar despercebida no meio das outras. */}
                          {uc.implantacao?.aguardandoLiberacao && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-1.5 py-0">
                              NOVA
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs">{formatCodigoUc(uc.codigoUc) || "-"}</td>
                      <td className="py-2.5 px-3">
                        {uc.consumer ? (
                          <Link
                            href={`/admin/consumidores/${uc.consumer.id}`}
                            title="Editar consumidor"
                            className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                          >
                            {uc.consumer.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {uc.plant ? (
                          <Link
                            href={`/admin/usinas/${uc.plant.id}`}
                            title="Abrir / editar usina"
                            className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                          >
                            {uc.plant.name}
                          </Link>
                        ) : (
                          // Sem usina, a compensação não tem de onde vir — é a
                          // primeira coisa a olhar numa UC parada na implantação.
                          <span
                            className={emImplantacao ? "text-red-700 text-xs font-medium" : "text-muted-foreground"}
                          >
                            {emImplantacao ? "sem usina" : "-"}
                          </span>
                        )}
                      </td>

                      {emImplantacao ? (
                        <>
                          <td className="py-2.5 px-3 text-center">
                            <EsperaBadge fase={uc.implantacao} />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {uc.implantacao?.faturasSemCompensacao ?? 0}
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs">
                            {uc.implantacao?.ultimaFatura ? (
                              formatCompetencia(uc.implantacao.ultimaFatura)
                            ) : (
                              <span className="text-muted-foreground">nenhuma lida</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-3">
                            {uc.distribuidora ?? <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {uc.consumoMedio ? `${uc.consumoMedio.toLocaleString("pt-BR")} kWh` : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-center text-xs">
                            {uc.implantacao?.primeiraCompensacao ? (
                              formatCompetencia(uc.implantacao.primeiraCompensacao)
                            ) : (
                              <span className="text-amber-700">em implantação</span>
                            )}
                          </td>
                        </>
                      )}

                      <td className="py-2.5 px-3 text-center">
                        {/* UC desativada manda no rótulo: mostrar "Ativo" do
                            texto do contrato numa UC fora do faturamento era
                            justamente a contradição entre as duas telas. */}
                        <Badge
                          variant={uc.active && uc.statusContrato !== "Pendente" ? "default" : "secondary"}
                          className={
                            uc.active && uc.statusContrato !== "Pendente"
                              ? "bg-emerald-500 hover:bg-emerald-600"
                              : ""
                          }
                        >
                          {!uc.active ? "Inativa" : (uc.statusContrato ?? "Ativo")}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/admin/unidades-consumidoras/${uc.id}/editar`}
                          title="Editar"
                          className="inline-flex p-1.5 rounded hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Aba → fase do domínio. "todas" não tem fase e é tratada antes. */
function faseDaAba(aba: Exclude<Aba, "todas">): FaseUc {
  return aba === "implantacao" ? "IMPLANTACAO" : "FATURANDO";
}

const CICLOS_ATRASO_LABEL = "tempo demais";

/**
 * Há quanto tempo a UC espera a primeira compensação, em ciclos — o maior entre
 * contas recebidas sem desconto e meses corridos desde o início. Cor pelo mesmo
 * corte que a lib usa, pra tabela e alerta nunca discordarem.
 */
function EsperaBadge({ fase }: { fase: FaseImplantacao | null }) {
  if (!fase) return <span className="text-muted-foreground">-</span>;
  const n = fase.ciclosEsperando;
  const cor =
    fase.alerta === "ATRASADA"
      ? "bg-red-100 text-red-800"
      : fase.alerta === "ATENCAO"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}
      title={
        fase.alerta === "OK"
          ? `Dentro do normal (até ${CICLOS_ATENCAO - 1} ciclos)`
          : "Espera acima do normal — vale checar rateio e cadastro na distribuidora"
      }
    >
      {n === 0 ? "recém-entrou" : `${n} ${n === 1 ? "ciclo" : "ciclos"}`}
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center" | "right";
}) {
  const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <th className={`py-2 px-3 font-medium text-xs uppercase tracking-wide ${alignClass}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "desc" ? "rotate-180" : ""} transition-transform`} />
      </button>
    </th>
  );
}

const ACCENT_CLASSES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
