import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatBRL, formatKWh, formatMonthYear } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function RelatoriosPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "INVESTOR") redirect("/");

  const investor = await prisma.investor.findUnique({
    where: { userId: session.user.id },
  });

  if (!investor) redirect("/");

  const reports = await prisma.monthlyReport.findMany({
    where: { investorId: investor.id, status: "PUBLISHED" },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });

  // Group by year
  const reportsByYear: Record<number, typeof reports> = {};
  for (const report of reports) {
    if (!reportsByYear[report.ano]) reportsByYear[report.ano] = [];
    reportsByYear[report.ano].push(report);
  }

  const years = Object.keys(reportsByYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatorios</h1>
        <p className="text-muted-foreground">
          Historico de relatorios mensais de energia solar
        </p>
      </div>

      {years.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              Nenhum relatorio disponivel ainda.
            </p>
          </CardContent>
        </Card>
      ) : (
        years.map((year) => (
          <div key={year} className="space-y-3">
            <h2 className="text-lg font-semibold">{year}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportsByYear[year].map((report) => (
                <Link key={report.id} href={`/relatorios/${report.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {formatMonthYear(report.mes, report.ano)}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs">
                          #{report.numeroRelatorio}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Geracao</span>
                        <span className="font-medium">
                          {formatKWh(report.injecaoPeriodo ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Remuneracao
                        </span>
                        <span className="font-medium text-emerald-600">
                          {formatBRL(report.remuneracaoPeriodo ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Creditos</span>
                        <span className="font-medium">
                          {formatKWh(report.creditosAtuais ?? 0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
