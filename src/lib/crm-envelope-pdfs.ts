/**
 * Diz QUAL documento é cada PDF do envelope de assinatura do CRM, lendo o
 * conteúdo — porque o nome da coluna não é confiável.
 *
 * O CRM guarda dois PDFs assinados por envelope, em `envelopes_assinatura`:
 * `pdf_termo_assinado` e `pdf_procuracao_assinada`. Em 15/08/2026, medindo as
 * 22 adesões existentes, o conteúdo estava trocado em 14 delas: a coluna do
 * termo trazia a PROCURAÇÃO e a da procuração trazia o TERMO. As outras 8
 * estavam certas.
 *
 * Isso descarta as duas correções óbvias:
 *   - inverter a leitura conserta as 14 e QUEBRA as 8;
 *   - confiar no nome da coluna é o que já está errado hoje.
 *
 * A troca também não segue cliente nem data — a PONTELLI tem 4 adesões, e só a
 * de número 59 está trocada. Parece escrita não-determinística lá na origem, o
 * que significa que adesões NOVAS podem nascer de qualquer um dos dois jeitos.
 * Por isso a classificação é por conteúdo, e não um de-para de ids.
 *
 * A causa raiz está no CRM (projeto GERADOR_PROPOSTA), que é quem grava as
 * colunas. Enquanto ela não for corrigida lá, este módulo é o que impede o
 * defeito de entrar no Gestor. Quando for, este código continua correto: ele
 * olha o documento, não a coluna.
 */

/** Primeira página em texto corrido, para reconhecer o cabeçalho. */
async function textoDaPrimeiraPagina(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
    ).href;
  }

  // pdfjs-dist DETACHA o Uint8Array que recebe: passa uma cópia, senão o buffer
  // do chamador vira comprimento zero e o segundo uso falha calado.
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return (content.items as Array<{ str?: string }>)
    .map((i) => i.str ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export type TipoDocumentoAssinado = "termo" | "procuracao";

/**
 * Classifica pelo cabeçalho da primeira página. Devolve null quando não dá para
 * afirmar — e nesse caso quem chama deve manter o nome da coluna, que acerta em
 * 8 de 22. Chute seria pior que o defeito conhecido.
 *
 * Os dois documentos citam a Associação e o aderente, então palavra solta não
 * serve: o que separa é o TÍTULO no topo ("PROCURAÇÃO" x "TERMO DE ADESÃO") e o
 * vocabulário de mandato (outorgante/outorgado), que só a procuração tem.
 */
export async function classificarPdfAssinado(
  buffer: Buffer,
): Promise<TipoDocumentoAssinado | null> {
  let texto: string;
  try {
    texto = (await textoDaPrimeiraPagina(buffer)).toUpperCase();
  } catch {
    // PDF ilegível não vira chute: quem chama cai no nome da coluna.
    return null;
  }

  // Só o começo: o termo de adesão MENCIONA a procuração lá adiante, e varrer a
  // página inteira faria os dois baterem nos dois padrões.
  const cabecalho = texto.slice(0, 400);

  const ehProcuracao = /PROCURA[ÇC][ÃA]O|OUTORGANTE|OUTORGAD[OA]/.test(cabecalho);
  const ehTermo = /TERMO DE ADES[ÃA]O|CONTRATO DE ADES[ÃA]O/.test(cabecalho);

  if (ehProcuracao && !ehTermo) return "procuracao";
  if (ehTermo && !ehProcuracao) return "termo";
  return null;
}

/**
 * Recebe os dois PDFs como vieram das colunas e devolve cada um no seu lugar.
 *
 * Regras, nesta ordem:
 *  1. Se a classificação por conteúdo identifica os dois e eles são diferentes,
 *     ela manda — trocados ou não.
 *  2. Se identifica só um, o outro recebe o papel que sobrou. Um envelope tem um
 *     documento de cada.
 *  3. Se não identifica nenhum, mantém o nome da coluna.
 */
export async function separarTermoEProcuracao(entrada: {
  colunaTermo: Buffer | null;
  colunaProcuracao: Buffer | null;
}): Promise<{
  termo: Buffer | null;
  procuracao: Buffer | null;
  /** true quando o conteúdo contrariou o nome da coluna — serve para log. */
  invertido: boolean;
}> {
  const { colunaTermo, colunaProcuracao } = entrada;

  // Com um só documento não há o que desembaralhar; classifica para não gravar
  // uma procuração solta no campo do termo.
  if (!colunaTermo || !colunaProcuracao) {
    const unico = colunaTermo ?? colunaProcuracao;
    if (!unico) return { termo: null, procuracao: null, invertido: false };
    const veioDaColunaTermo = Boolean(colunaTermo);
    const tipo = (await classificarPdfAssinado(unico)) ?? (veioDaColunaTermo ? "termo" : "procuracao");
    return {
      termo: tipo === "termo" ? unico : null,
      procuracao: tipo === "procuracao" ? unico : null,
      invertido: tipo !== (veioDaColunaTermo ? "termo" : "procuracao"),
    };
  }

  const [tipoA, tipoB] = await Promise.all([
    classificarPdfAssinado(colunaTermo),
    classificarPdfAssinado(colunaProcuracao),
  ]);

  // Caso 1 — os dois identificados e distintos.
  if (tipoA && tipoB && tipoA !== tipoB) {
    const invertido = tipoA === "procuracao";
    return {
      termo: tipoA === "termo" ? colunaTermo : colunaProcuracao,
      procuracao: tipoA === "procuracao" ? colunaTermo : colunaProcuracao,
      invertido,
    };
  }

  // Caso 2 — um identificado; o outro herda o papel que sobrou.
  if (tipoA && !tipoB) {
    const invertido = tipoA === "procuracao";
    return {
      termo: tipoA === "termo" ? colunaTermo : colunaProcuracao,
      procuracao: tipoA === "procuracao" ? colunaTermo : colunaProcuracao,
      invertido,
    };
  }
  if (tipoB && !tipoA) {
    const invertido = tipoB === "termo";
    return {
      termo: tipoB === "termo" ? colunaProcuracao : colunaTermo,
      procuracao: tipoB === "procuracao" ? colunaProcuracao : colunaTermo,
      invertido,
    };
  }

  // Caso 3 — nada identificado (ou os dois iguais, que não diz qual é qual):
  // mantém a coluna. É o comportamento antigo, e acerta em 8 de 22.
  return { termo: colunaTermo, procuracao: colunaProcuracao, invertido: false };
}
