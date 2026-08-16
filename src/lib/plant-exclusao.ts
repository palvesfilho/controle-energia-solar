import { prisma } from "@/lib/prisma";
import { ImpactoExclusao, plural } from "@/lib/exclusao";

// Avaliação de impacto antes de excluir uma usina. Fonte única usada pelo
// preview (GET /api/plants/[id]/exclusao) e pelo próprio DELETE — os dois
// precisam concordar, senão a tela libera e a API recusa (ou pior: o contrário).
//
// Contrato (bloqueios × avisos) descrito em @/lib/exclusao. Aqui todos os
// bloqueios são relações sem cascade no schema — o Postgres recusaria o delete
// de qualquer forma (P2003); a avaliação transforma a recusa em mensagem
// legível. Na UC não é assim, ver consumer-unit-exclusao.ts.

export type ImpactoExclusaoUsina = ImpactoExclusao;

export async function avaliarExclusaoUsina(
  id: string,
): Promise<ImpactoExclusaoUsina | null> {
  const plant = await prisma.plant.findUnique({
    where: { id },
    select: {
      name: true,
      cpflCredential: { select: { id: true } },
      _count: {
        select: {
          // bloqueios
          reports: true,
          investorPayables: true,
          consumerBills: true,
          monthlyData: true,
          consumerData: true,
          billings: true,
          rateioVersions: true,
          // avisos
          investors: true,
          consumers: true,
          consumerUnits: true,
          monitoringClients: true,
          documents: true,
          acoesRecomendadas: true,
        },
      },
    },
  });

  if (!plant) return null;

  const c = plant._count;

  const bloqueios: string[] = [];
  if (c.reports > 0) bloqueios.push(plural(c.reports, "relatório mensal", "relatórios mensais"));
  if (c.investorPayables > 0)
    bloqueios.push(plural(c.investorPayables, "pagamento a investidor", "pagamentos a investidor"));
  if (c.consumerBills > 0)
    bloqueios.push(plural(c.consumerBills, "fatura vinculada", "faturas vinculadas"));
  if (c.billings > 0)
    bloqueios.push(plural(c.billings, "faturamento mensal", "faturamentos mensais"));
  if (c.monthlyData > 0)
    bloqueios.push(plural(c.monthlyData, "registro de geração", "registros de geração"));
  if (c.consumerData > 0)
    bloqueios.push(plural(c.consumerData, "registro mensal de consumidor", "registros mensais de consumidor"));
  if (c.rateioVersions > 0)
    bloqueios.push(plural(c.rateioVersions, "versão de rateio", "versões de rateio"));

  const avisos: string[] = [];
  if (c.investors > 0)
    avisos.push(`${plural(c.investors, "investidor", "investidores")} será(ão) desvinculado(s) (o cadastro do investidor continua)`);
  if (c.consumers > 0)
    avisos.push(`${plural(c.consumers, "consumidor", "consumidores")} será(ão) desvinculado(s)`);
  if (c.consumerUnits > 0)
    avisos.push(`${plural(c.consumerUnits, "UC ficará", "UCs ficarão")} sem usina de origem`);
  if (c.monitoringClients > 0)
    avisos.push(`${plural(c.monitoringClients, "inversor monitorado ficará", "inversores monitorados ficarão")} sem usina`);
  if (c.documents > 0)
    avisos.push(`${plural(c.documents, "documento será apagado", "documentos serão apagados")}`);
  if (plant.cpflCredential) avisos.push("credencial da distribuidora será apagada");
  if (c.acoesRecomendadas > 0)
    avisos.push(`${plural(c.acoesRecomendadas, "ação recomendada ficará", "ações recomendadas ficarão")} sem usina`);

  return { nome: plant.name, bloqueios, avisos };
}
