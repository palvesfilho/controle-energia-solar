import { prisma } from "@/lib/prisma";
import { ImpactoExclusao, plural } from "@/lib/exclusao";

// Avaliação de impacto antes de excluir uma UC — gêmea de avaliarExclusaoUsina,
// usada pelo preview (GET /api/consumer-units/[id]/exclusao) e pelo DELETE.
//
// 🔑 Diferença crucial em relação à usina: aqui quase tudo é `onDelete: Cascade`.
// Faturas, faturamentos, itens de rateio e baselines seriam APAGADOS em silêncio
// pelo banco, sem erro nenhum. Antes desta avaliação, excluir uma UC levava junto
// o histórico inteiro dela e ninguém ficava sabendo. Os bloqueios abaixo são a
// única coisa entre o operador e essa perda.

export type ImpactoExclusaoUc = ImpactoExclusao;

export async function avaliarExclusaoUc(
  id: string,
): Promise<ImpactoExclusaoUc | null> {
  const uc = await prisma.consumerUnit.findUnique({
    where: { id },
    select: {
      nome: true,
      codigoUc: true,
      cpflCredential: { select: { id: true } },
      docTermoAdesao: true,
      docProcuracao: true,
      docAutorizacaoAcesso: true,
      _count: {
        select: {
          // bloqueios — histórico que não pode sumir
          bills: true,
          billings: true,
          rateioItems: true,
          investorPayables: true,
          consumoBaselines: true,
          // avisos — vínculos que a exclusão desfaz sozinha
          brasilSolarBeneficiarias: true,
          acoesRecomendadas: true,
          statusChanges: true,
        },
      },
    },
  });

  if (!uc) return null;

  const c = uc._count;

  const bloqueios: string[] = [];
  if (c.bills > 0)
    bloqueios.push(plural(c.bills, "fatura de energia", "faturas de energia"));
  if (c.billings > 0)
    bloqueios.push(plural(c.billings, "faturamento mensal", "faturamentos mensais"));
  if (c.investorPayables > 0)
    bloqueios.push(plural(c.investorPayables, "pagamento a investidor", "pagamentos a investidor"));
  if (c.rateioItems > 0)
    bloqueios.push(`${plural(c.rateioItems, "participação", "participações")} em rateio da usina`);
  if (c.consumoBaselines > 0)
    bloqueios.push(plural(c.consumoBaselines, "baseline de consumo", "baselines de consumo"));

  const avisos: string[] = [];
  if (uc.cpflCredential) avisos.push("credencial da distribuidora será apagada");
  if (uc.docTermoAdesao || uc.docProcuracao || uc.docAutorizacaoAcesso)
    avisos.push("documentos da adesão (termo/procuração/autorização de acesso) deixarão de ser acessíveis por esta UC");
  if (c.brasilSolarBeneficiarias > 0)
    avisos.push(
      `${plural(c.brasilSolarBeneficiarias, "beneficiária Brasil Solar ficará", "beneficiárias Brasil Solar ficarão")} sem UC vinculada`,
    );
  if (c.acoesRecomendadas > 0)
    avisos.push(
      `${plural(c.acoesRecomendadas, "ação recomendada ficará", "ações recomendadas ficarão")} sem UC`,
    );
  if (c.statusChanges > 0)
    avisos.push(
      `o histórico de ativação/desativação (${plural(c.statusChanges, "registro", "registros")}) será apagado`,
    );

  // A fila do CRM é ESPELHO do CRM: ela marca "já cadastrada" casando o código
  // da UC com os cadastros daqui. Apagar a UC desfaz esse casamento e a linha
  // volta a aparecer como pendente na fila. Quem quer sumir com ela de lá usa
  // "Ignorar" no CRM, não a exclusão aqui.
  const naFilaDoCrm = await prisma.crmUcImportada.count({
    where: { codigoUc: uc.codigoUc },
  });
  if (naFilaDoCrm > 0) {
    avisos.push(
      "esta UC veio da fila do CRM — ao excluir, ela volta a aparecer lá como 'a cadastrar' (para sumir da fila, use Ignorar no CRM)",
    );
  }

  return { nome: uc.nome, bloqueios, avisos };
}
