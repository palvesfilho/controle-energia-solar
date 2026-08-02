/**
 * Alinha CpflCredential.instalacao — o número realmente enviado ao Infosimples
 * e ao robô RGE — com o código de UC escolhido.
 *
 * Contexto: a migração de códigos da RGE (jul/2026) trocou ConsumerUnit.codigoUc
 * para o número novo (12 dígitos) e guardou o anterior em codigoUcAntigo. O
 * portal consultado pela Infosimples, porém, continua indexado pelo ANTIGO:
 * consultar com o novo devolve 612 "A instalação 'X' não foi encontrada".
 *
 * Este script NÃO mexe em ConsumerUnit.codigoUc (que segue exibindo o código
 * novo, correto na fatura) — só na credencial de consulta.
 *
 * Uso:
 *   npx tsx scripts/fix-cred-instalacao.ts --para antigo            # dry-run
 *   npx tsx scripts/fix-cred-instalacao.ts --para antigo --apply    # grava
 *   npx tsx scripts/fix-cred-instalacao.ts --para novo   --apply    # volta atrás
 *   ... --uc <codigoUc>   restringe a uma UC (teste pontual antes da massa)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const paraIdx = process.argv.indexOf("--para");
const PARA = paraIdx >= 0 ? process.argv[paraIdx + 1] : null; // "antigo" | "novo"
const ucIdx = process.argv.indexOf("--uc");
const UC_ARG = ucIdx >= 0 ? (process.argv[ucIdx + 1] ?? "").replace(/\D/g, "") : null;

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

async function main() {
  if (PARA !== "antigo" && PARA !== "novo") {
    console.error('Erro: informe --para antigo  ou  --para novo');
    process.exit(1);
  }

  const creds = await prisma.cpflCredential.findMany({
    where: {
      consumerUnitId: { not: null },
      ...(UC_ARG ? { consumerUnit: { codigoUc: UC_ARG } } : {}),
    },
    select: {
      id: true,
      instalacao: true,
      active: true,
      consumerUnitId: true,
      consumerUnit: {
        select: { nome: true, codigoUc: true, codigoUcAntigo: true, distribuidora: true },
      },
    },
  });

  const plano: {
    id: string;
    nome: string;
    de: string;
    para: string;
    distribuidora: string | null;
  }[] = [];
  const semAlvo: string[] = [];
  let jaOk = 0;

  for (const c of creds) {
    const novo = dig(c.consumerUnit?.codigoUc);
    const antigo = dig(c.consumerUnit?.codigoUcAntigo);
    const alvo = PARA === "antigo" ? antigo : novo;
    const atual = dig(c.instalacao);

    if (!alvo) {
      // Sem código antigo registrado não há para onde reverter — a UC nunca
      // migrou, ou o de-para não passou por ela. Fica como está.
      semAlvo.push(`${c.consumerUnit?.nome ?? "?"} (instalacao=${atual || "—"})`);
      continue;
    }
    if (alvo === atual) {
      jaOk++;
      continue;
    }
    plano.push({
      id: c.id,
      nome: c.consumerUnit?.nome ?? "?",
      de: atual || "—",
      para: alvo,
      distribuidora: c.consumerUnit?.distribuidora ?? null,
    });
  }

  console.log("=".repeat(70));
  console.log(`Alvo: instalacao = código ${PARA.toUpperCase()}${UC_ARG ? `  (só UC ${UC_ARG})` : ""}`);
  console.log(`Credenciais de UC analisadas: ${creds.length}`);
  console.log(`  a alterar          : ${plano.length}`);
  console.log(`  já no alvo         : ${jaOk}`);
  console.log(`  sem código de alvo : ${semAlvo.length}`);
  console.log("=".repeat(70));

  if (plano.length) {
    console.log("\n── A alterar ──");
    plano.forEach((p) =>
      console.log(`   ${p.de.padEnd(14)} → ${p.para.padEnd(14)} ${p.nome}`),
    );
    // A troca de código foi da RGE. Se uma UC de outra distribuidora entrou no
    // de-para, reverter a credencial dela pode ser errado — sinaliza pra conferência.
    const naoRge = plano.filter((p) => p.distribuidora !== "RGE");
    if (naoRge.length) {
      console.log(`\n── ⚠️ No plano mas NÃO são RGE (${naoRge.length}) — conferir ──`);
      naoRge.forEach((p) =>
        console.log(`   ${p.nome}  [${p.distribuidora ?? "sem distribuidora"}]  ${p.de} → ${p.para}`),
      );
    }
  }
  if (semAlvo.length) {
    console.log(`\n── ⏭️ Sem código ${PARA} registrado (mantidas) ──`);
    semAlvo.forEach((s) => console.log(`   ${s}`));
  }

  if (!APPLY) {
    console.log(`\nDry-run. Rode com --apply para gravar as ${plano.length} alteração(ões).`);
    return;
  }

  let ok = 0;
  for (const p of plano) {
    await prisma.cpflCredential.update({
      where: { id: p.id },
      // Zera o estado de sync: o erro gravado é do código anterior e ficaria
      // mentindo na tela de status até o próximo sync.
      data: { instalacao: p.para, statusSync: null, erroSync: null },
    });
    ok++;
    console.log(`   ✅ ${p.de} → ${p.para} ${p.nome}`);
  }
  console.log(`\n✅ ${ok} credencial(is) atualizada(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
