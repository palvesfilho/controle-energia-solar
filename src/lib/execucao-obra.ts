/**
 * Valor de EXECUÇÃO da obra: quanto a equipe cobra para instalar.
 *
 * O gestor de obras informa o valor no aceite da obra (obrigatório). O teto
 * vem do que foi vendido: a proposta do gerador já foi precificada contando
 * com a execução, então pagar acima disso come a margem da venda. Passou do
 * teto, o sistema BLOQUEIA e o gestor volta a negociar com a equipe — decisão
 * do Paulo em 28/10/2026.
 *
 * Teto = o MAIOR entre o valor mínimo do produto e quantidade × valor por
 * unidade (FV: R$ 1.000 até 10 placas, R$ 100/placa acima):
 *   - Fotovoltaica → por PLACA  (`sistema_projetado.qtd_modulos` da proposta)
 *   - Piso aquecido → por M²    (`dados_piso.area_total_m2` da proposta)
 *
 * O valor por unidade é configurado em Produtos do CRM. A inspeção completa
 * vai ter fórmula própria (pendente com o Paulo); até lá ela, a ampliação e os
 * demais produtos aceitam sem teto — o valor continua obrigatório.
 */

import { prisma } from "@/lib/prisma";
import type { UnidadeExecucao } from "@/lib/execucao-obra-regras";

export interface ExecucaoDaObra {
  codigoProduto: string | null;
  numeroProposta: string | null;
  quantidade: number | null;
  unidade: UnidadeExecucao | null;
  valorUnitario: number | null;
  valorMinimo: number | null;
  /** True quando o teto calculado é o valor mínimo, não a conta por unidade. */
  tetoPeloMinimo: boolean;
  /** Teto pela regra do produto, antes de qualquer decisão do admin. */
  tetoCalculado: number | null;
  /** Acima desta quantidade o teto automático não vale: projeto grande é negociado à parte. */
  limiteQtdAutomatico: number | null;
  /** Projeto grande ainda sem máximo do admin — o aceite fica travado. */
  aguardandoAdmin: boolean;
  /** Máximo definido pelo admin para esta obra (substitui o calculado). */
  autorizado: {
    valor: number;
    motivo: string | null;
    por: string | null;
    em: Date | null;
  } | null;
  /** Teto que vale no aceite. Null = sem teto (o valor segue obrigatório). */
  teto: number | null;
}

const SEM_VENDA = {
  codigoProduto: null,
  numeroProposta: null,
  quantidade: null,
  unidade: null,
  valorUnitario: null,
  valorMinimo: null,
  tetoPeloMinimo: false,
  tetoCalculado: null,
  limiteQtdAutomatico: null,
} as const;

/**
 * Teto de execução de cada obra, calculado na hora: quem muda o valor por
 * unidade em Produtos do CRM vê o efeito nas obras ainda pendentes.
 *
 * Ordem de quem manda no teto:
 *   1. o máximo AUTORIZADO pelo admin na própria obra (projeto grande ou caso
 *      extraordinário — pode ficar acima do calculado);
 *   2. projeto acima do limite de quantidade do produto sem autorização →
 *      aceite travado até o admin definir;
 *   3. a regra do produto (mínimo / quantidade × unitário).
 * Obra sem venda do CRM (criada à mão ou pelo cadastro de proprietário) só tem
 * teto se o admin definir.
 */
export async function execucaoDasObras(obraIds: string[]): Promise<Map<string, ExecucaoDaObra>> {
  const resultado = new Map<string, ExecucaoDaObra>();
  if (obraIds.length === 0) return resultado;

  const obras = await prisma.obra.findMany({
    where: { id: { in: obraIds } },
    select: {
      id: true,
      tetoExecucaoAutorizado: true,
      tetoExecucaoAutorizadoMotivo: true,
      tetoExecucaoAutorizadoPor: true,
      tetoExecucaoAutorizadoEm: true,
    },
  });
  const vendas = await prisma.crmVendaImportada.findMany({
    where: { obraId: { in: obraIds } },
    select: {
      obraId: true,
      codigoProduto: true,
      numeroProposta: true,
      qtdExecucao: true,
      unidadeExecucao: true,
    },
  });
  const produtos = await prisma.crmProdutoDestino.findMany({
    where: { codigoProduto: { in: [...new Set(vendas.map((v) => v.codigoProduto))] } },
    select: {
      codigoProduto: true,
      valorExecucaoUnitario: true,
      valorExecucaoMinimo: true,
      qtdMaxTetoAutomatico: true,
    },
  });
  const configPorProduto = new Map(produtos.map((p) => [p.codigoProduto, p]));
  const vendaPorObra = new Map(vendas.map((v) => [v.obraId, v]));

  for (const obra of obras) {
    const autorizado =
      obra.tetoExecucaoAutorizado != null
        ? {
            valor: obra.tetoExecucaoAutorizado,
            motivo: obra.tetoExecucaoAutorizadoMotivo,
            por: obra.tetoExecucaoAutorizadoPor,
            em: obra.tetoExecucaoAutorizadoEm,
          }
        : null;

    const v = vendaPorObra.get(obra.id);
    if (!v) {
      resultado.set(obra.id, {
        ...SEM_VENDA,
        aguardandoAdmin: false,
        autorizado,
        teto: autorizado?.valor ?? null,
      });
      continue;
    }

    const config = configPorProduto.get(v.codigoProduto);
    const valorUnitario = config?.valorExecucaoUnitario ?? null;
    const valorMinimo = config?.valorExecucaoMinimo ?? null;
    const limiteQtdAutomatico = config?.qtdMaxTetoAutomatico ?? null;
    const unidade = (v.unidadeExecucao as UnidadeExecucao | null) ?? null;
    // Sem quantidade não há conta: o mínimo sozinho não vira teto, senão uma
    // proposta sem o número de placas travaria a obra num valor arbitrário.
    const porUnidade =
      v.qtdExecucao != null && valorUnitario != null && valorUnitario > 0
        ? Math.round(v.qtdExecucao * valorUnitario * 100) / 100
        : null;
    const tetoPeloMinimo = porUnidade != null && valorMinimo != null && valorMinimo > porUnidade;
    const tetoCalculado = porUnidade == null ? null : tetoPeloMinimo ? valorMinimo : porUnidade;
    const projetoGrande =
      limiteQtdAutomatico != null && v.qtdExecucao != null && v.qtdExecucao > limiteQtdAutomatico;

    resultado.set(obra.id, {
      codigoProduto: v.codigoProduto,
      numeroProposta: v.numeroProposta,
      quantidade: v.qtdExecucao,
      unidade,
      valorUnitario,
      valorMinimo,
      tetoPeloMinimo,
      tetoCalculado,
      limiteQtdAutomatico,
      aguardandoAdmin: projetoGrande && !autorizado,
      autorizado,
      teto: autorizado ? autorizado.valor : projetoGrande ? null : tetoCalculado,
    });
  }
  return resultado;
}
