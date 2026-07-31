/**
 * Smoke test do parser do ANEXO 1 (Solicitação de Acesso — obras Nova Palma).
 * Uso: npx tsx scripts/test-anexo-1-parser.ts [pasta-ou-pdf]
 *      (default: ../anexos_nova_palma)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseAnexo1, ehAnexo1, extractLinesAnexo1 } from "../src/lib/anexo-1-parser";
import { parseAnexoF } from "../src/lib/anexo-f-parser";
import { modeloDaConcessionaria } from "../src/lib/anexo-modelos";

async function main() {
  const alvo = resolve(process.argv[2] ?? join(__dirname, "..", "..", "anexos_nova_palma"));
  const pdfs = statSync(alvo).isDirectory()
    ? readdirSync(alvo).filter((n) => n.toLowerCase().endsWith(".pdf")).map((n) => join(alvo, n))
    : [alvo];

  for (const caminho of pdfs) {
    const buf = new Uint8Array(readFileSync(caminho));
    const detectado = ehAnexo1(await extractLinesAnexo1(new Uint8Array(readFileSync(caminho))));
    console.log(`\n=== ${caminho.split(/[\\/]/).pop()} ===`);
    console.log(`detectado como Anexo 1: ${detectado}`);
    if (!detectado) continue;

    const { rawText: _rawText, avisos, ...d } = await parseAnexo1(buf);
    void _rawText;

    const mostrar = (titulo: string, campos: string[]) => {
      console.log(`\n--- ${titulo} ---`);
      for (const c of campos) {
        const v = (d as Record<string, unknown>)[c];
        console.log(`  ${c.padEnd(32)} ${v === undefined ? "— (não encontrado)" : String(v)}`);
      }
    };

    mostrar("Proprietário", ["nome", "cpfCnpj", "email", "telefone", "endereco", "cidade", "uf", "cep", "responsavelCliente", "responsavelClienteCpf"]);
    mostrar("Planta", ["codigoUc", "latitude", "longitude", "concessionaria", "tipoFonte"]);
    mostrar("Técnicos", ["modulosQuantidade", "modulosMarca", "modulosModelo", "potenciaModuloW", "potenciaInstalada", "inversorQuantidade", "inversorMarca", "inversorModelo", "inversorPotencia", "numeroFases", "tensaoNominal", "frequenciaHz", "areaModulosM2"]);
    mostrar("Declarado no documento", ["potenciaNominalDeclarada", "potenciaMaximaGeracaoDeclarada"]);
    mostrar("Responsável técnico", ["responsavelTecnico", "responsavelConselho", "responsavelCrea", "responsavelTelefone", "responsavelEmail", "dataSolicitacao", "dataOperacao", "tipoAtendimento"]);

    console.log("\n--- AVISOS ---");
    if (!avisos?.length) console.log("  (nenhum)");
    else avisos.forEach((a) => console.log(`  ⚠ ${a}`));

    // O que a tela de cadastro realmente chama é o parseAnexoF — confere que o
    // desvio interno funciona e entrega os mesmos dados.
    const viaRota = await parseAnexoF(new Uint8Array(readFileSync(caminho)));
    const checks: Array<[string, boolean]> = [
      ["parseAnexoF desviou pro Anexo 1", viaRota.nome === d.nome],
      ["potenciaInstalada = módulos × W", viaRota.potenciaInstalada === d.potenciaInstalada],
      ["codigoUc só dígitos", !!viaRota.codigoUc && /^\d+$/.test(viaRota.codigoUc)],
      ["coordenadas numéricas", typeof viaRota.latitude === "number" && typeof viaRota.longitude === "number"],
      ["avisos chegam na rota", (viaRota.avisos?.length ?? 0) === (avisos?.length ?? 0)],
    ];
    // Seseletor manda: escolher NOVA PALMA deve forçar o Anexo 1, e escolher
    // RGE (errado de propósito) deve avisar a divergência em vez de calar.
    const porConcessionaria = await parseAnexoF(
      new Uint8Array(readFileSync(caminho)),
      modeloDaConcessionaria("NOVA PALMA"),
    );
    const escolhaErrada = await parseAnexoF(
      new Uint8Array(readFileSync(caminho)),
      modeloDaConcessionaria("RGE"),
    );
    checks.push(
      ["NOVA PALMA força o Anexo 1", porConcessionaria.modeloUsado === "ANEXO_1"],
      ["detecção concorda com a escolha", porConcessionaria.modeloDetectado === "ANEXO_1"],
      ["escolha certa não gera aviso de divergência", !porConcessionaria.avisos?.some((a) => a.includes("estrutura do PDF"))],
      ["escolha errada roda o leitor escolhido", escolhaErrada.modeloUsado === "ANEXO_F"],
      ["escolha errada avisa a divergência", !!escolhaErrada.avisos?.some((a) => a.includes("estrutura do PDF"))],
    );

    console.log("\n--- CONFERÊNCIAS (via parseAnexoF) ---");
    checks.forEach(([n, ok]) => console.log(`${ok ? "OK    " : "FALHOU"} ${n}`));
    if (!checks.every(([, ok]) => ok)) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
