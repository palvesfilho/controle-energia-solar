/**
 * Recupera a curva intradiária dos dias que ficaram faltando — o que o botão
 * "coletar 7 dias" fazia na mão, uma usina por vez.
 *
 * Roda sozinho todo dia às 2h dentro de `fechar-e-podar.ts`. Este arquivo é a
 * entrada avulsa, para conferir o estado sem esperar a noite e para forçar um
 * mutirão com orçamento maior depois de um dia ruim de portal.
 *
 *   npx tsx scripts/recuperar-curva.ts                 # só mede, não chama portal
 *   npx tsx scripts/recuperar-curva.ts --apply
 *   npx tsx scripts/recuperar-curva.ts --apply --pares=300 --dias=7
 *
 * ⚠️ `DATABASE_URL` do `.env` aponta para PRODUÇÃO.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { recuperarDiasFaltantes } from "../src/lib/intraday-gapfill";

function arg(nome: string): string | undefined {
  const flag = `--${nome}=`;
  const a = process.argv.find((x) => x.startsWith(flag));
  return a ? a.slice(flag.length) : undefined;
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  const r = await recuperarDiasFaltantes({
    dias: arg("dias") ? Number(arg("dias")) : undefined,
    maxPares: arg("pares") ? Number(arg("pares")) : undefined,
    minSlots: arg("min-slots") ? Number(arg("min-slots")) : undefined,
    aplicar,
  });

  console.log(`\n  ${aplicar ? "APLICANDO" : "MEDINDO (nada é chamado nem gravado)"}`);
  console.log(`  sem curva ............ ${r.paresFaltando} dia(s)-usina`);
  console.log(`  curva parcial ........ ${r.paresParciais}`);
  console.log(`  no teto de tentativas  ${r.paresPulados}`);
  console.log(`  tentados agora ....... ${r.paresTentados}`);
  if (r.aplicado) {
    console.log(`  ✅ recuperados ....... ${r.paresRecuperados}`);
    console.log(`  portal sem dado ...... ${r.paresVazios}`);
    console.log(`  slots gravados ....... ${r.slotsGravados} · ${r.chamadas} chamadas`);
  }
  console.log(`  duração .............. ${(r.duracaoMs / 1000).toFixed(1)}s\n`);

  if (r.amostra.length > 0) {
    console.log("  primeiros da fila:");
    for (const p of r.amostra) {
      console.log(
        `    ${p.plataforma.padEnd(10)} ${p.dia}  ${String(p.slots).padStart(3)} slots · ` +
          `${p.tentativas} tentativa(s) · ${p.nome.slice(0, 36)}`,
      );
    }
    console.log();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("[recuperar-curva] FALHA:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
