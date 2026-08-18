/**
 * Propagação da credencial do portal do TITULAR para as UCs das beneficiárias
 * (Rede Brasil Solar).
 *
 * 🔑 **Por que existe.** Na RGE o mesmo login do titular abre todas as UCs dele,
 * então a beneficiária não tem acesso próprio — ela herda o do titular. Só que
 * a herança acontecia num único instante: ao SALVAR as beneficiárias, e apenas
 * se a credencial já existisse naquele segundo. Quem cadastrava na ordem
 * natural (UCs primeiro, senha do portal depois) caía numa janela morta e a
 * beneficiária ficava sem credencial para sempre.
 *
 * O sintoma não aparecia: o `sync-all` pula UC sem credencial devolvendo
 * "Sem credencial ativa" na lista de resultados — não é erro, não é alerta.
 * A UC simplesmente nunca era tentada. Foi assim que a UC `Cidade`
 * (195990300155) do SANDRO SOUZA passou 11 dias sem uma única fatura, com o
 * relatório dele cobrindo metade do consumo. Ver
 * [[project_growatt_zero_kwh_datalogger_mudo]].
 *
 * Por isso a propagação agora corre nos DOIS sentidos e sempre pelo mesmo
 * caminho: salvar beneficiária propaga, salvar/atualizar a credencial do
 * titular também. Meia correção falharia calada de novo —
 * [[feedback_correcao_pela_metade_falha_calada]].
 *
 * ⚠️ Nunca sobrescreve credencial com login DIFERENTE. Se a beneficiária tem
 * e-mail próprio, foi decisão de alguém: a UC entra em `ignoradas` e quem
 * chamou avisa, em vez de trocar o acesso calado —
 * [[feedback_anomalias_sinalizar]].
 */
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { normalizeCodigoUc } from "./uc-codigo";
import { normalizeConcessionaria } from "./concessionarias";

export type UcPropagada = {
  consumerUnitId: string;
  codigoUc: string;
  nome: string | null;
};

export type UcIgnorada = UcPropagada & { motivo: string };

export type ResultadoPropagacao = {
  /** Beneficiárias que não tinham credencial nenhuma e ganharam a do titular. */
  criadas: UcPropagada[];
  /** Beneficiárias que já tinham a MESMA conta e receberam a senha nova. */
  atualizadas: UcPropagada[];
  /** Beneficiárias deixadas como estavam, com o motivo. */
  ignoradas: UcIgnorada[];
};

const VAZIO: ResultadoPropagacao = { criadas: [], atualizadas: [], ignoradas: [] };

/** Mesma senha? Compara o TEXTO, não o cifrado: o AES-GCM usa IV aleatório, e
 *  dois cifrados da mesma senha nunca são iguais. */
function mesmaSenha(cifradoA: string, cifradoB: string): boolean {
  if (cifradoA === cifradoB) return true;
  try {
    return decrypt(cifradoA) === decrypt(cifradoB);
  } catch {
    // Linha legada (texto puro) ou chave trocada: não dá para afirmar que são
    // iguais. Devolve `false` e a senha do titular é regravada — o pior caso é
    // uma escrita à toa, contra uma beneficiária que ficaria sem sincronizar.
    return false;
  }
}

/**
 * Copia a credencial da UC titular para as UCs das beneficiárias do mesmo
 * proprietário Brasil Solar. Idempotente: rodar de novo não muda nada.
 *
 * Silenciosa por design quando a UC não é titular de ninguém (é o caso da
 * imensa maioria das UCs do fluxo investidor) — devolve tudo vazio.
 */
export async function propagarCredencialParaBeneficiarias(
  consumerUnitIdTitular: string,
): Promise<ResultadoPropagacao> {
  const cred = await prisma.cpflCredential.findUnique({
    where: { consumerUnitId: consumerUnitIdTitular },
    select: {
      emailCpfl: true,
      senhaCpfl: true,
      distribuidora: true,
      active: true,
      consumerUnit: { select: { codigoUc: true, codigoUcAntigo: true } },
    },
  });
  if (!cred || !cred.active || !cred.consumerUnit) return VAZIO;

  // O proprietário pode estar cadastrado pelo código NOVO ou pelo ANTIGO da UC
  // (migração RGE jul/2026) — procurar só por um deles não acha e não avisa.
  // Ver [[project_rge_troca_codigo_uc]].
  const codigos = [cred.consumerUnit.codigoUc, cred.consumerUnit.codigoUcAntigo]
    .flatMap((c) => (c ? [c, (normalizeCodigoUc(c) as string | null) ?? c] : []))
    .filter((c, i, arr) => arr.indexOf(c) === i);
  if (!codigos.length) return VAZIO;

  const proprietarios = await prisma.brasilSolarProprietario.findMany({
    where: {
      active: true,
      OR: [{ codigoUc: { in: codigos } }, { codigoUcAntigo: { in: codigos } }],
    },
    select: { id: true },
  });
  if (!proprietarios.length) return VAZIO;

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: {
      proprietarioId: { in: proprietarios.map((p) => p.id) },
      active: true,
      consumerUnitId: { not: null },
    },
    select: {
      nome: true,
      codigoUc: true,
      consumerUnitId: true,
      consumerUnit: { select: { distribuidora: true } },
    },
  });

  const resultado: ResultadoPropagacao = { criadas: [], atualizadas: [], ignoradas: [] };

  for (const b of beneficiarias) {
    const ucId = b.consumerUnitId!;
    // A titular costuma aparecer também como beneficiária (é ela quem consome
    // parte do próprio crédito) — sua credencial é a origem, não o destino.
    if (ucId === consumerUnitIdTitular) continue;

    const alvo: UcPropagada = { consumerUnitId: ucId, codigoUc: b.codigoUc, nome: b.nome };

    const existente = await prisma.cpflCredential.findUnique({
      where: { consumerUnitId: ucId },
      select: { emailCpfl: true, senhaCpfl: true, active: true },
    });

    // A concessionária sai do cadastro da UC; a da credencial do titular é o
    // último recurso — ver `concessionariaDaUc` em consumer-units/credentials.
    const distribuidora =
      normalizeConcessionaria(b.consumerUnit?.distribuidora ?? null) ??
      normalizeConcessionaria(cred.distribuidora) ??
      "RGE/CPFL";

    if (!existente) {
      await prisma.cpflCredential.create({
        data: {
          consumerUnitId: ucId,
          emailCpfl: cred.emailCpfl,
          // Senha viaja CIFRADA: é cópia do mesmo segredo, não passa por texto.
          senhaCpfl: cred.senhaCpfl,
          instalacao: (normalizeCodigoUc(b.codigoUc) as string | null) ?? b.codigoUc,
          distribuidora,
          // PENDING para o próximo sync agendado descobrir e baixar.
          statusSync: "PENDING",
        },
      });
      resultado.criadas.push(alvo);
      continue;
    }

    if (existente.emailCpfl !== cred.emailCpfl) {
      resultado.ignoradas.push({
        ...alvo,
        motivo: `tem acesso próprio (${existente.emailCpfl})`,
      });
      continue;
    }

    if (mesmaSenha(existente.senhaCpfl, cred.senhaCpfl) && existente.active) continue;

    // Mesma conta do titular: a senha nova vale para ela também. Sem isso, uma
    // troca de senha no portal deixaria a beneficiária falhando sozinha.
    await prisma.cpflCredential.update({
      where: { consumerUnitId: ucId },
      data: { senhaCpfl: cred.senhaCpfl, distribuidora, active: true, statusSync: "PENDING", erroSync: null },
    });
    resultado.atualizadas.push(alvo);
  }

  return resultado;
}

/** Frase pronta para toast/aviso. `null` quando não houve nada a dizer. */
export function resumoPropagacao(r: ResultadoPropagacao): string | null {
  const partes: string[] = [];
  if (r.criadas.length) {
    partes.push(
      `acesso copiado para ${r.criadas.length} beneficiária${r.criadas.length > 1 ? "s" : ""} (${r.criadas
        .map((u) => u.nome ?? u.codigoUc)
        .join(", ")})`,
    );
  }
  if (r.atualizadas.length) {
    partes.push(
      `senha atualizada em ${r.atualizadas.length} beneficiária${r.atualizadas.length > 1 ? "s" : ""}`,
    );
  }
  for (const i of r.ignoradas) {
    partes.push(`${i.nome ?? i.codigoUc} não foi alterada: ${i.motivo}`);
  }
  return partes.length ? partes.join("; ") : null;
}
