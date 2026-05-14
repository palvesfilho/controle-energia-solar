/**
 * Testa o sync Infosimples e exibe todos os campos novos extraídos
 * pelo parseBillData atualizado.
 *
 * Uso:
 *   npx tsx scripts/test-sync-novos-campos.ts <instalacao> [--save]
 *
 * Exemplo:
 *   npx tsx scripts/test-sync-novos-campos.ts 3095156869
 *   npx tsx scripts/test-sync-novos-campos.ts 3095156869 --save
 *
 * --save: persiste no banco via upsert (mesma lógica do sync-all)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decrypt } from "../src/lib/crypto";
import { consultarFatura, parseBillData, InfosimplesApiError } from "../src/lib/infosimples";

function brl(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function kwh(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} kWh`;
}

async function main() {
  const instalacao = process.argv[2];
  const shouldSave = process.argv.includes("--save");

  if (!instalacao) {
    console.error("Uso: npx tsx scripts/test-sync-novos-campos.ts <instalacao> [--save]");
    process.exit(1);
  }

  const cred = await prisma.cpflCredential.findFirst({
    where: { instalacao, active: true },
    include: { consumerUnit: true, plant: true },
  });

  if (!cred) {
    console.error(`Credencial ativa não encontrada para instalação ${instalacao}`);
    process.exit(1);
  }

  console.log("═══ Credencial ═══");
  console.log("UC:", cred.consumerUnit?.nome ?? cred.plant?.name ?? "-");
  console.log("Email:", cred.emailCpfl);
  console.log("Instalação:", cred.instalacao);
  console.log();

  console.log("═══ Consultando Infosimples... ═══");
  let faturas;
  try {
    faturas = await consultarFatura({
      email: cred.emailCpfl,
      senha: decrypt(cred.senhaCpfl),
      instalacao: cred.instalacao,
    });
  } catch (err) {
    if (err instanceof InfosimplesApiError) {
      console.error(`❌ Infosimples code=${err.code}: ${err.message}`);
      console.error("Errors:", err.errors);
    } else {
      console.error("❌ Erro:", err);
    }
    process.exit(1);
  }

  if (!faturas || faturas.length === 0) {
    console.log("⚠️  Nenhuma fatura retornada.");
    process.exit(0);
  }

  console.log(`✅ ${faturas.length} fatura(s) retornada(s).\n`);

  for (const [idx, fatura] of faturas.entries()) {
    console.log(`═══ Fatura ${idx + 1}/${faturas.length} ═══`);
    const parsed = parseBillData(fatura);

    console.log("┌─ Identificação");
    console.log(`│  Referência:    ${String(parsed.mesReferencia).padStart(2, "0")}/${parsed.anoReferencia}`);
    console.log(`│  Instalação:    ${parsed.instalacao}`);
    console.log(`│  Vencimento:    ${parsed.vencimento?.toLocaleDateString("pt-BR") ?? "—"}`);
    console.log(`│  Valor total:   ${brl(parsed.valorTotal)}`);
    console.log(`│  Paga:          ${parsed.contaPaga ? "sim" : "não"}`);
    console.log(`│  Código barras: ${parsed.codigoBarras ?? "—"}`);

    console.log("├─ Consumo");
    console.log(`│  Total:         ${kwh(parsed.consumoKwh)}`);
    console.log(`│  Dias:          ${parsed.diasFaturamento ?? "—"}`);
    console.log(`│  Leitura ant.:  ${parsed.leituraAnterior ?? "—"}`);
    console.log(`│  Leitura atual: ${parsed.leituraAtual ?? "—"}`);
    console.log(`│  Próx leitura:  ${parsed.proximaLeitura?.toLocaleDateString("pt-BR") ?? "—"}`);

    console.log("├─ Consumo faturado TE/TUSD (NOVO)");
    console.log(`│  TE:   ${kwh(parsed.consumoTeKwh)}  →  ${brl(parsed.consumoTeValor)}`);
    console.log(`│  TUSD: ${kwh(parsed.consumoTusdKwh)}  →  ${brl(parsed.consumoTusdValor)}`);

    console.log("├─ Energia injetada oUC (NOVO)");
    console.log(`│  TE total:   ${kwh(parsed.injetadaOucTeKwh)}  →  ${brl(parsed.injetadaOucTeValor)}`);
    console.log(`│  TUSD total: ${kwh(parsed.injetadaOucTusdKwh)}  →  ${brl(parsed.injetadaOucTusdValor)}`);
    if (parsed.injetadaDetalhes) {
      const det = JSON.parse(parsed.injetadaDetalhes) as Array<Record<string, unknown>>;
      console.log("│  Detalhamento por origem:");
      for (const d of det) {
        console.log(
          `│    ${d.mesOrigem}: TE ${kwh(d.teKwh as number)} (${brl(d.teValor as number)}) | TUSD ${kwh(d.tusdKwh as number)} (${brl(d.tusdValor as number)})`,
        );
      }
    }

    console.log("├─ Saldo de energia (NOVO)");
    console.log(`│  Instalação:       ${kwh(parsed.saldoInstalacaoKwh)}`);
    console.log(`│  Expira próx mês:  ${kwh(parsed.saldoExpirarProxMesKwh)}`);
    console.log(`│  Participação GD:  ${parsed.participacaoGeracaoPct ?? "—"}%`);

    console.log("├─ Tarifas / Bandeira");
    console.log(`│  Tarifa TE:   ${parsed.tarifaTE ?? "—"}`);
    console.log(`│  Tarifa TUSD: ${parsed.tarifaTUSD ?? "—"}`);
    console.log(`│  Bandeira:    ${parsed.bandeiraTarifaria ?? "—"}`);

    console.log("├─ Tributos");
    console.log(`│  ICMS:   ${brl(parsed.icms)}`);
    console.log(`│  PIS:    ${brl(parsed.pis)}`);
    console.log(`│  COFINS: ${brl(parsed.cofins)}`);

    console.log("├─ Encargos (NOVO)");
    console.log(`│  Juros mora:         ${brl(parsed.jurosMora)}`);
    console.log(`│  Multa atraso:       ${brl(parsed.multaAtraso)}`);
    console.log(`│  Atualização monet.: ${brl(parsed.atualizacaoMonetaria)}`);
    console.log(`│  Iluminação púb CIP: ${brl(parsed.iluminacaoPublicaCip)}`);
    console.log(`│  Ajuste saldo:       ${brl(parsed.ajusteSaldoCredito)}`);

    console.log("└─ Histórico 13 meses (NOVO)");
    if (parsed.historicoConsumo) {
      const hist = JSON.parse(parsed.historicoConsumo) as Array<Record<string, unknown>>;
      for (const h of hist) {
        console.log(`   ${h.mesAno}: ${kwh(h.consumoKwh as number)} / ${h.dias} dias`);
      }
    } else {
      console.log("   —");
    }

    console.log();

    if (shouldSave) {
      const consumerUnitId = cred.consumerUnitId;
      if (!consumerUnitId) {
        console.log("⚠️  --save ignorado (credencial é de usina, não UC de cliente).");
      } else {
        const unit = await prisma.consumerUnit.findUnique({ where: { id: consumerUnitId } });
        await prisma.consumerBill.upsert({
          where: {
            consumerUnitId_anoReferencia_mesReferencia: {
              consumerUnitId,
              anoReferencia: parsed.anoReferencia,
              mesReferencia: parsed.mesReferencia,
            },
          },
          update: { ...parsed, plantId: unit?.plantId || null, syncedAt: new Date() },
          create: { consumerUnitId, plantId: unit?.plantId || null, ...parsed, syncedAt: new Date() },
        });
        console.log("💾 Persistido no banco.\n");
      }
    } else {
      console.log("ℹ️  (rode com --save para persistir no banco)\n");
    }
  }
}

main()
  .catch((e) => { console.error("ERRO:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
