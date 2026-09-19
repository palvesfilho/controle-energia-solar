import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { concessionariaDaUsina } from "@/lib/concessionarias";

/**
 * GET /api/rateios/vigentes — o rateio VIGENTE de TODAS as usinas de uma vez.
 *
 * Por que esta rota existe, se já há `/api/plants/[id]/rateios/vigente`: aquela
 * responde "como está o rateio DESTA usina", e para responder "como está o
 * parque inteiro" seria uma consulta por usina. A pergunta do operador é outra —
 * ele quer varrer, comparar e exportar — e essa pergunta não tem dono no módulo
 * até aqui.
 *
 * Devolve UMA LINHA POR UC (não por usina) de propósito: é a linha da UC que
 * carrega o percentual, e é nela que mora o erro que interessa achar — UC no
 * rateio errado, percentual fora do lugar, soma que não fecha 100.
 *
 * Ordem ALFABÉTICA por usina (`Intl.Collator` pt-BR, que ordena acento e caixa
 * como gente espera), e dentro da usina por percentual decrescente: a UC âncora
 * primeiro.
 *
 * Só usinas ATIVAS. Usina desativada ainda tem `RateioVersion` com status
 * VIGENTE no banco — o desligamento do cadastro não mexe no rateio — e listá-la
 * aqui mostraria como vigente um rateio que não vale mais.
 */

/** Ordena como pt-BR: "Água" antes de "Azevedo", "10" antes de "9". */
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** A soma dos percentuais de um rateio fecha 100? (mesma folga do POST.) */
const TOLERANCIA_SOMA = 0.01;

type LinhaVigente = {
  // --- a usina ---
  plantId: string;
  plantNome: string;
  plantCidade: string | null;
  plantUc: string | null;
  plantUcAntiga: string | null;
  plantCpfCnpj: string | null;
  potenciaInstalada: number | null;
  geracaoMediaMensal: number | null;
  concessionaria: string | null;
  temCredencialRge: boolean;
  // --- o rateio vigente dessa usina (repetido em cada linha do grupo) ---
  rateioId: string;
  protocolo: string | null;
  protocoloSituacao: string | null;
  protocoloStatusRge: string | null;
  protocoloConsultadoEm: Date | null;
  vigenteAPartirDe: Date;
  aceitoEm: Date | null;
  aceitoPor: string | null;
  somaPercentual: number;
  somaFecha: boolean;
  totalUcs: number;
  // --- a UC desta linha ---
  ucId: string;
  ucNome: string;
  codigoUc: string | null;
  codigoUcAntigo: string | null;
  ucCpfCnpj: string | null;
  ucCidade: string | null;
  ucAtiva: boolean;
  percentual: number;
  /** A UC é a própria geradora (a conta da usina entra no rateio dela mesma). */
  isGeradora: boolean;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const plants = await prisma.plant.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      location: true,
      numeroUsina: true,
      unidadeConsumidora: true,
      unidadeConsumidoraAntiga: true,
      codigoCliente: true,
      cpfCnpj: true,
      potenciaInstalada: true,
      geracaoMediaMensal: true,
      // A usina guarda a concessionária em DOIS campos; ler só um faz metade
      // delas aparecer sem nenhuma (ver concessionariaDaUsina).
      concessionaria: true,
      distribuidora: true,
      cpflCredential: { select: { active: true } },
      rateioVersions: {
        where: { status: "VIGENTE" },
        select: {
          id: true,
          protocolo: true,
          protocoloSituacao: true,
          protocoloStatusRge: true,
          protocoloConsultadoEm: true,
          vigenteAPartirDe: true,
          aceitoEm: true,
          aceitoPor: true,
          items: {
            select: {
              percentual: true,
              consumerUnit: {
                select: {
                  id: true,
                  nome: true,
                  codigoUc: true,
                  codigoUcAntigo: true,
                  cpfCnpj: true,
                  cidade: true,
                  active: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const ordenadas = [...plants].sort((a, b) => collator.compare(a.name, b.name));

  const linhas: LinhaVigente[] = [];
  /** Usina ativa que NÃO tem rateio vigente — buraco, não ausência de dado. */
  const semRateio: Array<{
    plantId: string;
    plantNome: string;
    plantCidade: string | null;
    plantUc: string | null;
    concessionaria: string | null;
  }> = [];

  for (const p of ordenadas) {
    const concessionaria = concessionariaDaUsina(p);
    const vigente = p.rateioVersions[0];

    if (!vigente) {
      semRateio.push({
        plantId: p.id,
        plantNome: p.name,
        plantCidade: p.location,
        plantUc: p.unidadeConsumidora,
        concessionaria,
      });
      continue;
    }

    // Os códigos que marcam a conta da própria usina. Qualquer UC do rateio
    // cujo código bata com um deles é a geradora, não uma beneficiária.
    const codigosGeradora = new Set(
      [p.numeroUsina, p.unidadeConsumidora, p.codigoCliente].filter(
        Boolean,
      ) as string[],
    );

    const soma = vigente.items.reduce((acc, it) => acc + it.percentual, 0);
    const itens = [...vigente.items].sort((a, b) => b.percentual - a.percentual);

    for (const it of itens) {
      linhas.push({
        plantId: p.id,
        plantNome: p.name,
        plantCidade: p.location,
        plantUc: p.unidadeConsumidora,
        plantUcAntiga: p.unidadeConsumidoraAntiga,
        plantCpfCnpj: p.cpfCnpj,
        potenciaInstalada: p.potenciaInstalada,
        geracaoMediaMensal: p.geracaoMediaMensal,
        concessionaria,
        temCredencialRge: !!p.cpflCredential?.active,
        rateioId: vigente.id,
        protocolo: vigente.protocolo,
        protocoloSituacao: vigente.protocoloSituacao,
        protocoloStatusRge: vigente.protocoloStatusRge,
        protocoloConsultadoEm: vigente.protocoloConsultadoEm,
        vigenteAPartirDe: vigente.vigenteAPartirDe,
        aceitoEm: vigente.aceitoEm,
        aceitoPor: vigente.aceitoPor,
        somaPercentual: soma,
        somaFecha: Math.abs(soma - 100) <= TOLERANCIA_SOMA,
        totalUcs: vigente.items.length,
        ucId: it.consumerUnit.id,
        ucNome: it.consumerUnit.nome,
        codigoUc: it.consumerUnit.codigoUc,
        codigoUcAntigo: it.consumerUnit.codigoUcAntigo,
        ucCpfCnpj: it.consumerUnit.cpfCnpj,
        ucCidade: it.consumerUnit.cidade,
        ucAtiva: it.consumerUnit.active,
        percentual: it.percentual,
        isGeradora:
          !!it.consumerUnit.codigoUc &&
          codigosGeradora.has(it.consumerUnit.codigoUc),
      });
    }
  }

  const usinasComRateio = new Set(linhas.map((l) => l.plantId));
  const somaNaoFecha = new Set(
    linhas.filter((l) => !l.somaFecha).map((l) => l.plantId),
  );

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    linhas,
    semRateio,
    resumo: {
      usinasComRateio: usinasComRateio.size,
      usinasSemRateio: semRateio.length,
      ucs: linhas.length,
      /** Usinas cuja soma de percentuais não fecha 100 — crédito sobrando ou faltando. */
      usinasSomaNaoFecha: somaNaoFecha.size,
      /** Rateios vigentes que nunca receberam protocolo da concessionária. */
      semProtocolo: new Set(
        linhas.filter((l) => !l.protocolo).map((l) => l.plantId),
      ).size,
    },
  });
}
