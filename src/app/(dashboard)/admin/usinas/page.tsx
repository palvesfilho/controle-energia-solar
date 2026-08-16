"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowUpDown,
  Sun,
  Zap,
  Users,
  Factory,
} from "lucide-react";
import { formatCodigoUc } from "@/lib/uc-codigo";
import { formatCpfCnpj } from "@/lib/documento";
import { formatKWh } from "@/lib/formatters";
import { matchBusca } from "@/lib/busca";
import { concessionariaDaUsina } from "@/lib/concessionarias";
import { ExcluirUsinaDialog } from "@/components/plants/excluir-usina-dialog";

interface PlantData {
  id: string;
  name: string;
  fonte: string | null;
  numeroUsina: string | null;
  unidadeConsumidora: string | null;
  potenciaInstalada: number | null;
  geracaoMediaMensal: number | null;
  grupo: string | null;
  cpfCnpj: string | null;
  // Os dois campos do mesmo conceito — ver concessionariaDaUsina().
  concessionaria: string | null;
  distribuidora: string | null;
  acesso: string | null;
  statusContrato: string | null;
  active: boolean;
  investors: {
    valorKwhContrato: number | null;
    investor: { user: { name: string } };
  }[];
  // UCs do rateio VIGENTE da usina — não é a contagem do ConsumerUnit.plantId.
  // Usina sem rateio vigente vem 0. Ver comentário em /api/plants.
  ucsRateioCount: number;
}

type SortKey = "name" | "potencia" | "geracao" | "ucs" | "status";
type SortDir = "asc" | "desc";

export default function UsinasPage() {
  const [plants, setPlants] = useState<PlantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ativo" | "inativo">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [excluirTarget, setExcluirTarget] = useState<PlantData | null>(null);

  useEffect(() => {
    fetch("/api/plants")
      .then((res) => res.json())
      .then(setPlants)
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    // Conta pelo `active`, o campo que os filtros de Faturamento, Agenda e
    // painel admin usam de fato. O `statusContrato` é texto solto da importação
    // (9 das 29 usinas estão em branco) e contava menos usinas do que a operação
    // realmente tem em circulação.
    const ativas = plants.filter((p) => p.active).length;
    const totalPotencia = plants.reduce((acc, p) => acc + (p.potenciaInstalada ?? 0), 0);
    const totalUcs = plants.reduce((acc, p) => acc + p.ucsRateioCount, 0);
    return { total: plants.length, ativas, totalPotencia, totalUcs };
  }, [plants]);

  const filtered = useMemo(() => {
    const rows = plants.filter((p) => {
      if (statusFilter === "ativo" && !p.active) return false;
      if (statusFilter === "inativo" && p.active) return false;
      return matchBusca(search, [
        p.name,
        p.numeroUsina,
        p.unidadeConsumidora,
        p.cpfCnpj,
        // Buscar pelos DOIS: quem digita "RGE" tem que achar tanto a usina
        // legada (distribuidora="RGE") quanto a nova (concessionaria="RGE/CPFL").
        p.concessionaria,
        p.distribuidora,
      ]);
    });

    rows.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "potencia":
          return ((a.potenciaInstalada ?? 0) - (b.potenciaInstalada ?? 0)) * dir;
        case "geracao": {
          // Usina sem projeção cadastrada vai SEMPRE pro fim da lista, nos dois
          // sentidos — hoje são 28 de 29, e deixá-las ordenar como zero faria a
          // ordem crescente abrir com um paredão de traços.
          const av = a.geracaoMediaMensal;
          const bv = b.geracaoMediaMensal;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          return (av - bv) * dir;
        }
        case "ucs":
          return (a.ucsRateioCount - b.ucsRateioCount) * dir;
        case "status":
          return ((a.active ? 0 : 1) - (b.active ? 0 : 1)) * dir;
      }
    });
    return rows;
  }, [plants, search, statusFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usinas</h1>
          <p className="text-sm text-muted-foreground">Gerencie as usinas geradoras</p>
        </div>
        <Link
          href="/admin/usinas/nova"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nova Usina
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Sun className="h-4 w-4" />} label="Total" value={stats.total} accent="amber" />
        <StatCard icon={<Factory className="h-4 w-4" />} label="Ativas" value={stats.ativas} accent="emerald" />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Potência instalada"
          value={`${stats.totalPotencia.toLocaleString("pt-BR")} kWp`}
          accent="blue"
        />
        <StatCard icon={<Users className="h-4 w-4" />} label="UCs no rateio" value={stats.totalUcs} accent="zinc" />
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, número, CPF/CNPJ ou concessionária..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativas</option>
              <option value="inativo">Inativas</option>
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} de {stats.total}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {plants.length === 0 ? "Nenhuma usina cadastrada." : "Nenhum resultado para os filtros."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <SortHeader label="Nome" active={sort.key === "name"} dir={sort.dir} onClick={() => toggleSort("name")} />
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">UC</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">CPF/CNPJ</th>
                    <SortHeader label="Potência" align="right" active={sort.key === "potencia"} dir={sort.dir} onClick={() => toggleSort("potencia")} />
                    <SortHeader label="Geração média/mês" align="right" active={sort.key === "geracao"} dir={sort.dir} onClick={() => toggleSort("geracao")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Grupo</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Concessionária</th>
                    <SortHeader label="UCs" align="center" active={sort.key === "ucs"} dir={sort.dir} onClick={() => toggleSort("ucs")} />
                    <SortHeader label="Status" align="center" active={sort.key === "status"} dir={sort.dir} onClick={() => toggleSort("status")} />
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plant) => (
                    <tr key={plant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{plant.name}</td>
                      <td className="py-2.5 px-3 font-mono text-xs">
                        {formatCodigoUc(plant.unidadeConsumidora) ?? plant.numeroUsina ?? "-"}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{formatCpfCnpj(plant.cpfCnpj)}</td>
                      <td className="py-2.5 px-3 text-right">
                        {plant.potenciaInstalada ? `${plant.potenciaInstalada} kWp` : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <GeracaoMediaCell valor={plant.geracaoMediaMensal} />
                      </td>
                      <td className="py-2.5 px-3 text-center">{plant.grupo ?? "-"}</td>
                      <td className="py-2.5 px-3">{concessionariaDaUsina(plant) ?? "-"}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={plant.ucsRateioCount > 0 ? "secondary" : "outline"}
                          className={plant.ucsRateioCount > 0 ? "" : "text-muted-foreground"}
                          title={
                            plant.ucsRateioCount > 0
                              ? `${plant.ucsRateioCount} UC(s) no rateio vigente`
                              : "Sem rateio vigente — nenhuma UC ligada a esta usina"
                          }
                        >
                          {plant.ucsRateioCount}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={plant.active ? "default" : "secondary"}
                          className={plant.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {plant.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/usinas/${plant.id}`}
                            title="Abrir / editar"
                            className="inline-flex p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setExcluirTarget(plant)}
                            title="Excluir usina"
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExcluirUsinaDialog
        plantId={excluirTarget?.id ?? null}
        plantName={excluirTarget?.name ?? ""}
        open={excluirTarget !== null}
        onOpenChange={(open) => !open && setExcluirTarget(null)}
        onExcluida={(id) => setPlants((prev) => prev.filter((p) => p.id !== id))}
      />
    </div>
  );
}

/**
 * Geração média mensal PROJETADA — o valor que veio do cadastro da usina
 * (`Plant.geracaoMediaMensal`), sem fallback: nada é medido nem estimado aqui.
 *
 * Em 14/08/2026 só 1 das 29 usinas tinha o campo preenchido, então o estado
 * normal desta coluna é o traço. Ele é rotulado como "não cadastrada" em vez de
 * "0" de propósito — em branco significa que ninguém informou, não que a usina
 * não gera.
 *
 * O valor negativo tem tratamento próprio porque existe de verdade na base
 * (VITOR PAULO BOLZAN estava com -0,02): geração projetada não pode ser ≤ 0, e
 * um número desses passando como legítimo na lista contamina qualquer leitura
 * de frota feita em cima da tela.
 */
function GeracaoMediaCell({ valor }: { valor: number | null }) {
  if (valor == null) {
    return (
      <span className="text-muted-foreground" title="Geração média mensal não cadastrada nesta usina">
        —
      </span>
    );
  }

  if (valor <= 0) {
    return (
      <span
        className="text-red-600 dark:text-red-400"
        title="Valor inválido no cadastro: geração média projetada precisa ser maior que zero. Corrija em Editar usina."
      >
        {formatKWh(valor)} ⚠
      </span>
    );
  }

  return <span>{formatKWh(valor)}</span>;
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
