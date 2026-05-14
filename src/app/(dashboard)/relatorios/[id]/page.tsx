import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { formatBRL, formatKWh, formatMonthYear, formatNumber } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const report = await prisma.monthlyReport.findUnique({
    where: { id },
    include: {
      investor: { include: { user: true } },
      plant: true,
    },
  });

  if (!report) notFound();

  if (
    session.user.role === "INVESTOR" &&
    report.investor.userId !== session.user.id
  ) {
    redirect("/painel");
  }

  // Get the investor-plant link for commercial terms
  const investorPlant = await prisma.investorPlant.findUnique({
    where: {
      investorId_plantId: {
        investorId: report.investorId,
        plantId: report.plantId,
      },
    },
  });

  const plant = report.plant;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link
        href={session.user.role === "ADMIN" ? "/admin/relatorios" : "/relatorios"}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Extrato Mensal - {formatMonthYear(report.mes, report.ano)}
          </h1>
          <p className="text-muted-foreground">
            {report.investor.user.name} - {plant.name} - Relatorio #{report.numeroRelatorio}
          </p>
        </div>
        <Badge
          variant={report.status === "PUBLISHED" ? "default" : "secondary"}
          className={report.status === "PUBLISHED" ? "bg-emerald-500" : ""}
        >
          {report.status === "PUBLISHED" ? "Publicado" : report.status === "DRAFT" ? "Rascunho" : "Arquivado"}
        </Badge>
      </div>

      {/* Investor + Plant Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do Investidor e Usina</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {[
              ["Investidor", report.investor.user.name],
              ["Usina", plant.name],
              ["Localizacao", plant.location ?? "-"],
              ["Potencia Modulos", `${plant.potenciaModulos ?? "-"} kWp`],
              ["Potencia Inversor", `${plant.potenciaInversor ?? "-"} kW`],
              ["Geracao Media Mensal", formatKWh(plant.geracaoMediaMensal ?? 0)],
              ["Valor kWh Contrato", formatBRL(investorPlant?.valorKwhContrato ?? 0)],
              ["Gestao Fixa em Contrato", formatBRL(investorPlant?.gestaoFixaContrato ?? 0)],
              ["Enquadramento", plant.enquadramento ?? "-"],
              ["Unidade Consumidora", plant.unidadeConsumidora ?? "-"],
              ["Concessionaria", plant.concessionaria ?? "-"],
              ["Formato de Leitura", plant.formatoLeitura ?? "-"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {label}
                </dt>
                <dd className="text-sm font-semibold mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Resultado Energetico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-green-800 bg-green-50 -mx-6 -mt-6 px-6 py-3 rounded-t-lg">
            Resultado Energetico
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {[
              ["A", "Injecao no Periodo", formatKWh(report.injecaoPeriodo ?? 0), true],
              ["B", "Creditos Anteriores da Usina", formatKWh(report.creditosAnteriores ?? 0), false],
              ["C", "Creditos Utilizados Neste Periodo", formatKWh(report.creditosUtilizados ?? 0), false],
              ["D", "Consumo Instantaneo", formatKWh(report.consumoInstantaneo ?? 0), false],
              ["E", "Auto Consumo Usina", formatKWh(report.autoConsumoUsina ?? 0), false],
              ["F", "Creditos Atuais", formatKWh(report.creditosAtuais ?? 0), true],
              ["G", "Creditos a Vencer", formatKWh(report.creditosVencer ?? 0), false],
            ].map(([code, label, value, highlight]) => (
              <div
                key={code as string}
                className={`flex items-center justify-between px-6 py-3 ${highlight ? "bg-green-50/50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{code as string}</span>
                  <span className="text-sm">{label as string}</span>
                </div>
                <span className={`text-sm font-semibold ${highlight ? "text-green-800" : ""}`}>
                  {value as string}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resultado Financeiro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-emerald-700 bg-emerald-50 -mx-6 -mt-6 px-6 py-3 rounded-t-lg">
            Resultado Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {[
              ["F", "Creditos Utilizados no Periodo", formatNumber(report.creditosUtilizadosFin ?? 0), false],
              ["G", "Valor do kWh de Contrato", formatBRL(report.valorKwhContrato ?? 0), false],
              ["H", "Valor Bruto do Gerador (F x G)", formatBRL(report.valorBrutoGerador ?? 0), true],
            ].map(([code, label, value, highlight]) => (
              <div
                key={`fin-${code}`}
                className={`flex items-center justify-between px-6 py-3 ${highlight ? "bg-slate-50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{code as string}</span>
                  <span className="text-sm">{label as string}</span>
                </div>
                <span className="text-sm font-semibold">{value as string}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="divide-y">
            {[
              ["I", "Gestao Mensal Fixa", `- ${formatBRL(report.gestaoMensalFixa ?? 0)}`],
              ["J", "Taxa Minima da Concessionaria + IP", `- ${formatBRL(report.taxaMinimaConc ?? 0)}`],
              ["K", "Inadimplencia", formatBRL(report.inadimplencia ?? 0)],
              ["L", "Multas, Renegociacoes, Outros", formatBRL(report.multasOutros ?? 0)],
            ].map(([code, label, value]) => (
              <div key={`ded-${code}`} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{code as string}</span>
                  <span className="text-sm text-muted-foreground">{label as string}</span>
                </div>
                <span className="text-sm">{value as string}</span>
              </div>
            ))}
          </div>

          <Separator className="border-t-2" />

          <div className="flex items-center justify-between px-6 py-4 bg-emerald-50">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-emerald-700 w-5">M</span>
              <span className="text-base font-bold text-emerald-700">
                Remuneracao do Periodo (H-I-J-K)
              </span>
            </div>
            <span className="text-xl font-bold text-emerald-700">
              {formatBRL(report.remuneracaoPeriodo ?? 0)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Observacoes */}
      {report.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observacoes Importantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {report.observacoes}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
