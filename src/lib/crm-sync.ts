/**
 * Sincronização de leitura CRM → Gestor.
 *
 * O que faz, a cada rodada:
 *   1. garante o de-para produto → destino (só cria o que falta; nunca
 *      sobrescreve o que o operador editou na tela);
 *   2. lê as vendas GANHAS e as adesões do CRM;
 *   3. classifica cada venda e grava/atualiza uma linha em CrmVendaImportada;
 *   4. cria a Obra com aprovacao=PENDENTE quando o produto gera obra.
 *
 * Idempotente por `propostaIdCrm`: rodar de novo não duplica obra nem fila.
 * Nada é escrito no CRM.
 *
 * O que ele deliberadamente NÃO faz: vincular a obra a um cliente Brasil Solar.
 * Os 1.819 `brasil_solar_clients` estão sem CPF/CNPJ, então casar por nome
 * criaria vínculo errado em silêncio. O vínculo é escolha de quem aprova.
 */
import { prisma } from "@/lib/prisma";
import {
  crmConfigurado,
  extrairCodigosUc,
  listarAdesoes,
  listarClientes,
  listarProdutos,
  listarPropostasPorIds,
  listarUsuarios,
  listarVendasGanhas,
  type AdesaoCrm,
  type PropostaCrm,
} from "@/lib/crm-supabase";

export type TipoObra = "INSTALACAO" | "MANUTENCAO";
export type DestinoGestao = "NENHUM" | "ADESAO" | "USINA_UC" | "MONITORAMENTO";

export type SituacaoImportacao =
  | "PENDENTE"
  | "CONCLUIDA"
  | "IGNORADA"
  | "NAO_CLASSIFICADO"
  | "ASSINADA_SEM_VENDA";

interface LinhaDePara {
  codigoProduto: string;
  nomeProduto: string;
  geraObra: boolean;
  tipoObra: TipoObra | null;
  destinoGestao: DestinoGestao;
}

/**
 * De-para inicial, fechado com o Paulo em 02/08/2026.
 *
 * É só a SEMENTE: uma vez criada a linha, quem manda é a tela. Produto do CRM
 * que não estiver aqui nem na tabela cai em NAO_CLASSIFICADO e aparece pro
 * operador — nunca some em silêncio.
 */
export const DE_PARA_PADRAO: LinhaDePara[] = [
  // Obra de instalação
  { codigoProduto: "solar_fotovoltaica", nomeProduto: "Energia Solar Fotovoltaica", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "NENHUM" },
  { codigoProduto: "ampliacao_fv", nomeProduto: "Ampliação de Sistema Fotovoltaico", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "NENHUM" },
  { codigoProduto: "piso_aquecido", nomeProduto: "Aquecimento de Piso", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "NENHUM" },
  { codigoProduto: "aquecimento_solar", nomeProduto: "Aquecimento Solar para Banho", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "NENHUM" },
  { codigoProduto: "trocador_piscina", nomeProduto: "Trocador de Calor para Piscina", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "NENHUM" },

  // Obra de manutenção / serviço em campo
  { codigoProduto: "inspecao_completa", nomeProduto: "Inspeção Completa", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },
  { codigoProduto: "produtos_avulsos", nomeProduto: "Produto Avulso", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },
  { codigoProduto: "troca_local_fv", nomeProduto: "Troca de Local de Sistema Fotovoltaico", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },
  { codigoProduto: "vistoria", nomeProduto: "Vistoria", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },
  { codigoProduto: "inspecao", nomeProduto: "Inspeção", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },
  { codigoProduto: "auditoria", nomeProduto: "Auditoria", geraObra: true, tipoObra: "MANUTENCAO", destinoGestao: "NENHUM" },

  // Gestão de créditos
  { codigoProduto: "simulacao_desconto", nomeProduto: "Desconto na Fatura de Energia", geraObra: false, tipoObra: null, destinoGestao: "ADESAO" },
  // Cliente cede o telhado: vira usina E UC pra gestão, e gera obra em ~90%
  // dos casos. Os 10% que não geram são resolvidos na própria fila de
  // aprovação — o gestor de obras recusa.
  { codigoProduto: "desconto_fatura_telhado", nomeProduto: "Proposta Desconto Fatura Telhado", geraObra: true, tipoObra: "INSTALACAO", destinoGestao: "USINA_UC" },
  { codigoProduto: "acompanhamento_performance", nomeProduto: "Acompanhamento Mensal de Performance", geraObra: false, tipoObra: null, destinoGestao: "MONITORAMENTO" },

  // Não entram no Gestor (tarefa administrativa ou estudo)
  { codigoProduto: "cotacao_seguro", nomeProduto: "Cotação de Seguro", geraObra: false, tipoObra: null, destinoGestao: "NENHUM" },
  { codigoProduto: "estudo_fluxo_inverso", nomeProduto: "Estudo de Viabilidade — Fluxo Inverso", geraObra: false, tipoObra: null, destinoGestao: "NENHUM" },
  { codigoProduto: "consultoria", nomeProduto: "Consultoria", geraObra: false, tipoObra: null, destinoGestao: "NENHUM" },
  { codigoProduto: "homologacao_concessionaria", nomeProduto: "Homologar Projeto na Concessionária", geraObra: false, tipoObra: null, destinoGestao: "NENHUM" },
  { codigoProduto: "dimensionamento_bateria", nomeProduto: "Dimensionamento de Baterias", geraObra: false, tipoObra: null, destinoGestao: "NENHUM" },
];

export interface ResultadoSync {
  rodou: boolean;
  motivo?: string;
  vendasGanhas: number;
  linhasNovas: number;
  linhasAtualizadas: number;
  obrasCriadas: number;
  naoClassificados: string[];
  assinadasSemVenda: number;
  erros: string[];
}

/** Cria as linhas do de-para que ainda não existem. Nunca sobrescreve edição. */
export async function garantirDeParaPadrao(): Promise<number> {
  const existentes = await prisma.crmProdutoDestino.findMany({
    select: { codigoProduto: true },
  });
  const jaTem = new Set(existentes.map((e) => e.codigoProduto));
  const faltando = DE_PARA_PADRAO.filter((l) => !jaTem.has(l.codigoProduto));

  if (faltando.length > 0) {
    await prisma.crmProdutoDestino.createMany({
      data: faltando.map((l) => ({
        codigoProduto: l.codigoProduto,
        nomeProduto: l.nomeProduto,
        geraObra: l.geraObra,
        tipoObra: l.tipoObra,
        destinoGestao: l.destinoGestao,
      })),
      skipDuplicates: true,
    });
  }

  return faltando.length;
}

function primeiraDataValida(...valores: (string | null | undefined)[]): Date | null {
  for (const valor of valores) {
    if (!valor) continue;
    const data = new Date(valor);
    if (!Number.isNaN(data.getTime())) return data;
  }
  return null;
}

function nomeDaObra(nomeProduto: string, clienteNome: string): string {
  return `${nomeProduto} — ${clienteNome}`.slice(0, 200);
}

export async function sincronizarCrm(): Promise<ResultadoSync> {
  const base: ResultadoSync = {
    rodou: false,
    vendasGanhas: 0,
    linhasNovas: 0,
    linhasAtualizadas: 0,
    obrasCriadas: 0,
    naoClassificados: [],
    assinadasSemVenda: 0,
    erros: [],
  };

  if (!crmConfigurado()) {
    return {
      ...base,
      motivo:
        "CRM_SUPABASE_URL / CRM_SUPABASE_SERVICE_KEY não configuradas — sync não executado.",
    };
  }

  await garantirDeParaPadrao();

  const [produtos, ganhas, clientes, adesoes, usuarios, dePara] = await Promise.all([
    listarProdutos(),
    listarVendasGanhas(),
    listarClientes(),
    listarAdesoes(),
    listarUsuarios(),
    prisma.crmProdutoDestino.findMany(),
  ]);

  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const emailPorUsuarioId = new Map(usuarios.map((u) => [u.id, u.email ?? null]));
  const deParaPorCodigo = new Map(dePara.map((d) => [d.codigoProduto, d]));
  const adesaoPorProposta = new Map<number, AdesaoCrm>();
  for (const a of adesoes) {
    if (a.proposta_id != null) adesaoPorProposta.set(a.proposta_id, a);
  }

  // Adesões assinadas cuja proposta NÃO está entre as ganhas: precisam
  // aparecer numa caixa própria em vez de sumir.
  const idsGanhas = new Set(ganhas.map((p) => p.id));
  const idsAdesaoSemGanha = adesoes
    .map((a) => a.proposta_id)
    .filter((id): id is number => id != null && !idsGanhas.has(id));
  const propostasSemGanha = await listarPropostasPorIds(idsAdesaoSemGanha);

  const resultado: ResultadoSync = { ...base, rodou: true, vendasGanhas: ganhas.length };
  const naoClassificados = new Set<string>();

  const processar = async (proposta: PropostaCrm, ehVendaGanha: boolean) => {
    const produto = proposta.produto_id != null ? produtoPorId.get(proposta.produto_id) : undefined;
    const codigoProduto = produto?.codigo ?? `produto_id_${proposta.produto_id ?? "desconhecido"}`;
    const nomeProduto = produto?.nome ?? "(produto desconhecido no CRM)";

    const cliente = proposta.cliente_id != null ? clientePorId.get(proposta.cliente_id) : undefined;
    const adesao = adesaoPorProposta.get(proposta.id);

    const clienteNome = adesao?.cliente_nome ?? cliente?.nome ?? "(sem cliente)";
    const documento =
      adesao?.cliente_documento ?? cliente?.cpf ?? cliente?.cnpj ?? cliente?.documento ?? null;
    const codigosUc = adesao ? extrairCodigosUc(adesao.unidades_consumidoras) : [];

    const regra = deParaPorCodigo.get(codigoProduto);
    const geraObra = ehVendaGanha && (regra?.ativo ?? false) && regra!.geraObra;
    const destinoGestao = (regra?.ativo ? regra.destinoGestao : "NENHUM") as DestinoGestao;

    let situacao: SituacaoImportacao;
    if (!ehVendaGanha) {
      situacao = "ASSINADA_SEM_VENDA";
    } else if (!regra) {
      situacao = "NAO_CLASSIFICADO";
      naoClassificados.add(`${codigoProduto} (${nomeProduto})`);
    } else if (!regra.ativo || (!regra.geraObra && destinoGestao === "NENHUM")) {
      situacao = "IGNORADA";
    } else if (destinoGestao === "NENHUM") {
      // Só gera obra: quando a obra existir, não sobra trabalho nesta ponta.
      situacao = "CONCLUIDA";
    } else {
      situacao = "PENDENTE";
    }

    const dados = {
      numeroProposta: proposta.numero,
      codigoProduto,
      nomeProduto,
      clienteNome,
      clienteDocumento: documento,
      clienteIdCrm: proposta.cliente_id,
      cidade: adesao?.cidade ?? proposta.cidade_instalacao ?? cliente?.cidade ?? null,
      vendedorEmail: proposta.vendedor_id ? emailPorUsuarioId.get(proposta.vendedor_id) ?? null : null,
      valorInvestimento: proposta.valor_investimento,
      fechadoEm: primeiraDataValida(proposta.fechado_em, proposta.data_fechamento),
      statusNegocio: proposta.status_negocio ?? "desconhecido",
      adesaoIdCrm: adesao?.id ?? null,
      concessionaria: adesao?.concessionaria ?? proposta.concessionaria ?? null,
      codigosUc: codigosUc.length > 0 ? codigosUc.join(",") : null,
      mediaMensalKwh: adesao?.media_mensal_kwh ?? null,
    };

    const existente = await prisma.crmVendaImportada.findUnique({
      where: { propostaIdCrm: proposta.id },
      select: { id: true, obraId: true, situacao: true, processadaEm: true },
    });

    // Já processada à mão nesta ponta? Não mexe na situação — só atualiza os
    // dados vindos do CRM, pra não desfazer o trabalho de quem cadastrou.
    const jaProcessada = existente?.processadaEm != null;

    if (!existente) {
      await prisma.crmVendaImportada.create({
        data: { propostaIdCrm: proposta.id, situacao, ...dados },
      });
      resultado.linhasNovas += 1;
    } else {
      await prisma.crmVendaImportada.update({
        where: { propostaIdCrm: proposta.id },
        data: jaProcessada ? dados : { situacao, ...dados },
      });
      resultado.linhasAtualizadas += 1;
    }

    if (!ehVendaGanha) resultado.assinadasSemVenda += 1;

    // Obra: cria uma única vez por proposta.
    if (geraObra && !existente?.obraId) {
      const obra = await prisma.obra.create({
        data: {
          nome: nomeDaObra(nomeProduto, clienteNome),
          descricao:
            regra?.tipoObra === "MANUTENCAO"
              ? "Serviço de manutenção originado de venda ganha no CRM."
              : "Instalação originada de venda ganha no CRM.",
          cliente: clienteNome,
          local: dados.cidade,
          status: "PLANEJAMENTO",
          aprovacao: "PENDENTE",
          observacoes: [
            `Origem: CRM, proposta ${proposta.numero ?? proposta.id}`,
            dados.vendedorEmail ? `Vendedor: ${dados.vendedorEmail}` : null,
            documento ? `Documento do cliente: ${documento}` : null,
            codigosUc.length > 0 ? `UC(s): ${codigosUc.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      });

      await prisma.crmVendaImportada.update({
        where: { propostaIdCrm: proposta.id },
        data: { obraId: obra.id },
      });
      resultado.obrasCriadas += 1;
    }
  };

  for (const proposta of ganhas) {
    try {
      await processar(proposta, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultado.erros.push(`proposta ${proposta.id}: ${msg}`);
    }
  }

  for (const proposta of propostasSemGanha) {
    try {
      await processar(proposta, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultado.erros.push(`proposta ${proposta.id} (adesão sem venda): ${msg}`);
    }
  }

  resultado.naoClassificados = [...naoClassificados];
  return resultado;
}
