import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/shared/stat-card";
import { Zap, DollarSign, Battery, Home } from "lucide-react";
import { formatBRL, formatKWh, formatMonthYear } from "@/lib/formatters";
import { EnergyChart } from "@/components/dashboard/energy-chart";
import { FinancialChart } from "@/components/dashboard/financial-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function PainelPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "INVESTOR") redirect("/");

  const investor = await prisma.investor.findUnique({
    where: { userId: session.user.id },
    include: {
      plants: {
        include: { plant: true },
      },
    },
  });

  if (!investor) redirect("/");

  const reports = await prisma.monthlyReport.findMany({
    where: { investorId: investor.id, status: "PUBLISHED" },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    take: 12,
    include: { plant: true },
  });

  const latestReport = reports[0];
  const chartData = [...reports].reverse().map((r) => ({
    month: formatMonthYear(r.mes, r.ano),
    shortMonth: `${String(r.mes).padStart(2, "0")}/${r.ano}`,
    injecao: r.injecaoPeriodo ?? 0,
    consumo: r.consumoInstantaneo ?? 0,
    autoConsumo: r.autoConsumoUsina ?? 0,
    creditos: r.creditosAtuais ?? 0,
    remuneracao: r.remuneracaoPeriodo ?? 0,
    valorBruto: r.valorBrutoGerador ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Ola, {session.user.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground">
          Seus resultados de energia solar
          {latestReport && ` - ${formatMonthYear(latestReport.mes, latestReport.ano)}`}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Geracao do Mes"
          value={latestReport ? formatKWh(latestReport.injecaoPeriodo ?? 0) : "-"}
          icon={Zap}
          color="green"
        />
        <StatCard
          title="Remuneracao"
          value={latestReport ? formatBRL(latestReport.remuneracaoPeriodo ?? 0) : "-"}
          icon={DollarSign}
          color="emerald"
        />
        <StatCard
          title="Creditos Atuais"
          value={latestReport ? formatKWh(latestReport.creditosAtuais ?? 0) : "-"}
          icon={Battery}
          color="teal"
        />
        <StatCard
          title="Autoconsumo"
          value={
            latestReport
              ? formatKWh(
                  (latestReport.consumoInstantaneo ?? 0) +
                    (latestReport.autoConsumoUsina ?? 0)
                )
              : "-"
          }
          icon={Home}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EnergyChart data={chartData} />
        <FinancialChart data={chartData} />
      </div>

      {/* Plants Info */}
      {investor.plants.map((ip) => (
        <Card key={ip.id}>
          <CardHeader>
            <CardTitle className="text-base">Usina: {ip.plant.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              {[
                ["Localizacao", ip.plant.location ?? "-"],
                ["Potencia Modulos", `${ip.plant.potenciaModulos ?? "-"} kWp`],
                ["Potencia Inversor", `${ip.plant.potenciaInversor ?? "-"} kW`],
                ["Geracao Media Mensal", formatKWh(ip.plant.geracaoMediaMensal ?? 0)],
                ["Gestao Fixa", formatBRL(ip.gestaoFixaContrato ?? 0)],
                ["Valor kWh Contrato", formatBRL(ip.valorKwhContrato ?? 0)],
                ["Enquadramento", ip.plant.enquadramento ?? "-"],
                ["Unidade Consumidora", ip.plant.unidadeConsumidora ?? "-"],
                ["Concessionaria", ip.plant.concessionaria ?? "-"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-semibold mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}

      {/* Recent Reports */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ultimos Relatorios</CardTitle>
              <Link href="/relatorios" className="text-sm text-green-700 hover:underline">
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reports.slice(0, 5).map((report) => (
                <Link
                  key={report.id}
                  href={`/relatorios/${report.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {formatMonthYear(report.mes, report.ano)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {report.plant.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm text-emerald-600">
                      {formatBRL(report.remuneracaoPeriodo ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatKWh(report.injecaoPeriodo ?? 0)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
