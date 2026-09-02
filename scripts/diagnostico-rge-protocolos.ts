/**
 * Mostra o que o robô da RGE receberia AGORA se pedisse trabalho ao Gestor —
 * com a senha do portal MASCARADA.
 *
 * Existe porque a rota `/api/integracoes/rge/protocolos-rateio` devolve senha de
 * portal de cliente em texto claro: conferir a integração chamando-a no terminal
 * despejaria credencial na tela e no histórico do shell. Aqui a mesma seleção é
 * refeita em leitura pura, e o que se vê é a forma do payload, não o segredo.
 *
 * Não escreve nada. Rodar:
 *   npx tsx scripts/diagnostico-rge-protocolos.ts
 */
import { prisma } from "../src/lib/prisma";
import { normalizeConcessionaria } from "../src/lib/concessionarias";
import { grafiasDoCodigoUc } from "../src/lib/robo-faturas";
import {
  SITUACAO_LABEL,
  periodosDaBusca,
  protocoloConsultavel,
} from "../src/lib/rge-protocolo";

async function main() {
  const versoes = await prisma.rateioVersion.findMany({
    where: { status: "PENDENTE_ACEITE", protocolo: { not: null } },
    select: {
      id: true,
      protocolo: true,
      criadoEm: true,
      protocoloSituacao: true,
      protocoloStatusRge: true,
      protocoloConsultadoEm: true,
      protocoloTentativaEm: true,
      plant: {
        select: {
          name: true,
          unidadeConsumidora: true,
          unidadeConsumidoraAntiga: true,
          numeroUsina: true,
          cpfCnpj: true,
          concessionaria: true,
          distribuidora: true,
          cpflCredential: {
            select: { emailCpfl: true, instalacao: true, active: true },
          },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });

  console.log(`\n== RATEIOS PENDENTES COM PROTOCOLO: ${versoes.length} ==\n`);

  let consultaveis = 0;
  for (const v of versoes) {
    const p = v.plant;
    const conc = normalizeConcessionaria(p.concessionaria ?? p.distribuidora ?? null);
    const cred = p.cpflCredential;

    let veredito: string;
    if (!protocoloConsultavel(v.protocolo)) veredito = "SAI: protocolo inválido";
    else if (conc !== "RGE/CPFL") veredito = `SAI: concessionária ${conc ?? "não informada"}`;
    else if (!cred?.active) veredito = "SAI: usina sem login da RGE";
    else veredito = "VAI PARA O ROBÔ";

    if (veredito === "VAI PARA O ROBÔ") consultaveis++;

    const grafias = [
      p.unidadeConsumidora,
      p.unidadeConsumidoraAntiga,
      p.numeroUsina,
      cred?.instalacao,
    ]
      .filter((c): c is string => !!c?.trim())
      .flatMap(grafiasDoCodigoUc);

    const jaLido = v.protocoloSituacao
      ? `${SITUACAO_LABEL[v.protocoloSituacao as keyof typeof SITUACAO_LABEL] ?? v.protocoloSituacao}` +
        (v.protocoloStatusRge ? ` ("${v.protocoloStatusRge}")` : "") +
        ` em ${(v.protocoloConsultadoEm ?? v.protocoloTentativaEm)?.toLocaleDateString("pt-BR")}`
      : "nunca consultado";

    console.log(`${p.name}`);
    console.log(`  pedido ...... ${v.protocolo}`);
    console.log(`  veredito .... ${veredito}`);
    console.log(`  já lido ..... ${jaLido}`);
    console.log(`  login ....... ${cred?.active ? mascararEmail(cred.emailCpfl) : "—"}`);
    console.log(`  UCs a tentar. ${[...new Set(grafias.map((g) => g.replace(/\D/g, "")))].join(", ") || "NENHUMA"}`);
    console.log(`  meses ....... ${periodosDaBusca(v.criadoEm).join(", ")}`);
    console.log("");
  }

  console.log(`resumo: ${consultaveis} de ${versoes.length} seguem para o robô.`);
  await prisma.$disconnect();
}

/** paulo@... — confere a conta sem publicar o endereço inteiro. */
function mascararEmail(email: string): string {
  const [antes, dominio] = email.split("@");
  return `${antes.slice(0, 3)}...@${dominio ?? "?"}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
