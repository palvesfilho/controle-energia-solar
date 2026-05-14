import { prisma } from "@/lib/prisma";
import { formatBRL, formatKWh, formatMonthYear } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminRelatoriosPage() {
  const reports = await prisma.monthlyReport.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: {
      investor: { include: { user: true } },
      plant: true,
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Gerencie todos os relatórios mensais</p>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Todos os relatórios</h2>
            <span className="text-xs text-muted-foreground">
              {reports.length} relatório{reports.length !== 1 ? "s" : ""}
            </span>
          </div>
          {reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum relatório encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Investidor</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Período</th>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Geração</th>
                    <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Remuneração</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{report.investor.user.name}</td>
                      <td className="py-2.5 px-3">{formatMonthYear(report.mes, report.ano)}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{report.plant.name}</td>
                      <td className="py-2.5 px-3 text-right">{formatKWh(report.injecaoPeriodo ?? 0)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                        {formatBRL(report.remuneracaoPeriodo ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={report.status === "PUBLISHED" ? "default" : "secondary"}
                          className={report.status === "PUBLISHED" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                        >
                          {report.status === "PUBLISHED" ? "Publicado" : "Rascunho"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Link
                          href={`/relatorios/${report.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          Ver
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
