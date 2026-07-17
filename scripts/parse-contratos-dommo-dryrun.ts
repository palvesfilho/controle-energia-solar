/**
 * Dry-run: roda o parser de contrato Dommo nos PDFs informados e imprime
 * uma tabela markdown com a extração. NÃO grava nada no banco nem no R2.
 *
 * Uso:
 *   npx tsx scripts/parse-contratos-dommo-dryrun.ts <pdf1> [pdf2 ...]
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseContratoDommo } from "../src/lib/contrato-dommo-parser";

function fmtCpfCnpj(d: string | null): string {
  if (!d) return "—";
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d;
}

function fmtData(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function fmtNum(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  return `${n.toLocaleString("pt-BR")}${suffix}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("uso: tsx scripts/parse-contratos-dommo-dryrun.ts <pdf>...");
    process.exit(1);
  }

  const rows: Array<{ file: string; ext: Awaited<ReturnType<typeof parseContratoDommo>> }> = [];

  for (const path of args) {
    process.stderr.write(`[parsing] ${basename(path)}\n`);
    try {
      const buf = await readFile(path);
      // Clone — pdfjs dreina o ArrayBuffer
      const cloned = new Uint8Array(buf.byteLength);
      cloned.set(buf);
      const ext = await parseContratoDommo(cloned);
      rows.push({ file: basename(path), ext });
    } catch (e) {
      process.stderr.write(`[ERRO] ${basename(path)}: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  // Tabela
  console.log("\n# Extração — Contratos Dommo (dry-run)\n");
  console.log("| Arquivo | Nome | CPF/CNPJ | Cidade/UF | Data | R$/kWh | Gestão/mês | Potência | Geração esperada | Prazo | Avisos |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const c = r.ext.contratante;
    const cidadeUf = c.cidade ? `${c.cidade}/${c.uf ?? "?"}` : "—";
    const doc = fmtCpfCnpj(c.cnpj ?? c.cpf);
    const data = fmtData(r.ext.dataAssinatura);
    const kwh = r.ext.valorKwh != null ? `R$ ${r.ext.valorKwh.toFixed(2).replace(".", ",")}` : "—";
    const gestao = r.ext.gestaoFixaMensal != null ? `R$ ${r.ext.gestaoFixaMensal.toFixed(2).replace(".", ",")}` : "—";
    const pot = fmtNum(r.ext.potenciaInstaladaKwp, " kWp");
    const ger = fmtNum(r.ext.geracaoMediaMensalKwh, " kWh");
    const prazo = r.ext.prazoMeses != null ? `${r.ext.prazoMeses}m` : "—";
    const av = r.ext.warnings.length ? r.ext.warnings.join("; ") : "ok";
    console.log(
      `| ${r.file} | ${c.nome ?? "—"} | ${doc} | ${cidadeUf} | ${data} | ${kwh} | ${gestao} | ${pot} | ${ger} | ${prazo} | ${av} |`,
    );
  }

  // Detalhes adicionais por arquivo
  console.log("\n## Endereço, foro, marco de início\n");
  for (const r of rows) {
    console.log(`### ${r.file}`);
    console.log(`- Tipo: ${r.ext.contratante.tipo}${r.ext.contratante.socioRepresentante ? ` (sócio: ${r.ext.contratante.socioRepresentante})` : ""}`);
    console.log(`- Endereço: ${r.ext.contratante.endereco ?? "—"}, CEP ${r.ext.contratante.cep ?? "—"}`);
    console.log(`- Foro: ${r.ext.foro ?? "—"}`);
    console.log(`- Marco início prazo: ${r.ext.marcoInicioPrazo ?? "—"}`);
    console.log(`- Antecedência rescisão: ${r.ext.antecedenciaRescisaoDias ?? "—"} dias`);
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
