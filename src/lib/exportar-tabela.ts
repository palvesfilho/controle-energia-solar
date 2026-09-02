/**
 * Exportação de tabelas para Excel.
 *
 * A leitura é feita sobre a tabela JÁ RENDERIZADA na tela, e não sobre o estado
 * do React. Isso é de propósito: cada tela tem o seu próprio filtro, a sua
 * própria ordenação e a sua própria formatação, e ler o DOM garante que o
 * arquivo sai exatamente igual ao que o operador está vendo — com o filtro
 * aplicado, na ordem escolhida. Se lêssemos o estado, cada tela precisaria
 * declarar de novo o que já está na tela, e as duas versões iam divergir calado.
 *
 * Como uma tela ajusta o que sai no arquivo:
 *   - `data-export="ignorar"` num `<th>`/`<td>`/`<tr>` tira a coluna ou a linha
 *     (é o caso da coluna "Ações", que só tem botão).
 *   - `data-export-valor="1234.56"` num `<td>` manda o valor cru, quando o texto
 *     da tela perde precisão ou não dá para reconstruir.
 */

/** Um valor já convertido para o tipo que o Excel vai receber. */
export type CelulaExportada = string | number | Date | null;

export type TabelaLida = {
  colunas: string[];
  linhas: CelulaExportada[][];
};

/** Colunas cujo cabeçalho é só de ação/controle e nunca interessa no arquivo. */
const CABECALHOS_IGNORADOS = new Set(["ações", "acoes", "ação", "acao", ""]);

/**
 * Números pt-BR: "1.234,56", "-12,5", "0,85".
 * Exige a vírgula decimal de propósito — sem ela, "3.090.582.291" (código de UC
 * pontuado) viraria número e perderia os zeros à esquerda e a pontuação.
 */
const NUMERO_PT_BR = /^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/;
/**
 * Inteiro, com ou sem ponto de milhar: "12", "1500", "1.500".
 * Só é aplicado quando a célula traz unidade (kWh, kWp, R$, %) — é a unidade
 * que separa uma grandeza de um código de UC pontuado.
 */
const INTEIRO_COM_UNIDADE = /^-?\d{1,3}(\.\d{3})*$|^-?\d+$/;
/**
 * Inteiro pequeno e sem pontuação: "0", "7", "2026". Vira número mesmo sem
 * unidade, porque coluna de contagem ("UCs", "Faturas") só serve somada.
 * O teto de 4 dígitos mantém fora os identificadores — código de UC tem 10,
 * CPF 11, CNPJ 14 — e o zero à esquerda proibido preserva códigos como "007".
 */
const CONTAGEM = /^-?(0|[1-9]\d{0,3})$/;
/** Data pt-BR: "31/12/2026". */
const DATA_PT_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;
/** Competência: "08/2026". */
const COMPETENCIA = /^(\d{2})\/(\d{4})$/;

/** Sufixos e prefixos que provam que a célula é uma grandeza, não um código. */
const UNIDADES = /\s*(kWh|kWp|kW|MWh|%|R\$)\s*/gi;

/**
 * Texto visível da célula.
 *
 * Usa `innerText` e não `textContent`: célula com duas linhas (nome em cima,
 * investidor embaixo) tem os dois textos em `<div>` irmãos, e `textContent` os
 * cola sem separador — "Usina ModeloJoão Alberto". `innerText` respeita o que
 * está desenhado e devolve a quebra, que aqui vira um espaço.
 */
function textoDaCelula(td: Element): string {
  const bruto = (td as HTMLElement).innerText ?? td.textContent ?? "";
  return bruto.replace(/\s+/g, " ").trim();
}

function ehIgnorada(el: Element): boolean {
  return el.getAttribute("data-export") === "ignorar";
}

/**
 * Converte o texto da tela no tipo que o Excel entende.
 *
 * A regra é conservadora: na dúvida, texto. Um número que sai como texto só
 * incomoda quem vai somar; um código de UC que sai como número sai ERRADO.
 */
export function converterCelula(texto: string, valorCru?: string | null): CelulaExportada {
  if (valorCru != null && valorCru !== "") {
    const n = Number(valorCru);
    if (Number.isFinite(n)) return n;
    const d = new Date(valorCru);
    if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(valorCru)) return d;
    return valorCru;
  }

  const t = texto.trim();
  if (t === "" || t === "-" || t === "—") return null;

  const data = DATA_PT_BR.exec(t);
  if (data) {
    // Meio-dia para o fuso não empurrar a data para o dia anterior no Excel.
    return new Date(Number(data[3]), Number(data[2]) - 1, Number(data[1]), 12);
  }
  // Competência fica como texto: "08/2026" como data viraria 01/08/2026 e o
  // operador leria um dia que não existe no dado.
  if (COMPETENCIA.test(t)) return t;

  const temUnidade = UNIDADES.test(t);
  UNIDADES.lastIndex = 0;
  const semUnidade = t.replace(UNIDADES, "").trim();

  if (NUMERO_PT_BR.test(semUnidade)) {
    const n = Number(semUnidade.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  // Inteiro pontuado só vira número se a unidade provar que é grandeza.
  if (temUnidade && INTEIRO_COM_UNIDADE.test(semUnidade)) {
    const n = Number(semUnidade.replace(/\./g, ""));
    if (Number.isFinite(n)) return n;
  }
  if (CONTAGEM.test(semUnidade)) return Number(semUnidade);

  return t;
}

/**
 * Lê uma tabela do DOM. Retorna `null` quando a tabela não tem nenhuma linha de
 * dado — a tela deve tratar isso como "nada para exportar", não como erro.
 */
export function lerTabela(tabela: HTMLTableElement): TabelaLida | null {
  // `:scope >` mantém a leitura na tabela pedida: tela com tabela aninhada
  // (linha que expande) não deve derramar as linhas de dentro no arquivo.
  const linhasCabecalho = Array.from(tabela.querySelectorAll(":scope > thead > tr"));
  // Em cabeçalho agrupado, a última linha é a das colunas-folha.
  const cabecalho = linhasCabecalho[linhasCabecalho.length - 1];

  const celulasCabecalho = cabecalho
    ? Array.from(cabecalho.querySelectorAll(":scope > th, :scope > td"))
    : [];

  const indicesMantidos: number[] = [];
  const colunas: string[] = [];
  celulasCabecalho.forEach((th, i) => {
    const label = textoDaCelula(th);
    if (ehIgnorada(th) || CABECALHOS_IGNORADOS.has(label.toLowerCase())) return;
    indicesMantidos.push(i);
    colunas.push(label);
  });

  if (colunas.length === 0) return null;

  const corpo = [
    ...Array.from(tabela.querySelectorAll(":scope > tbody > tr")),
    ...Array.from(tabela.querySelectorAll(":scope > tfoot > tr")),
  ];

  const linhas: CelulaExportada[][] = [];
  for (const tr of corpo) {
    if (ehIgnorada(tr)) continue;
    const tds = Array.from(tr.querySelectorAll(":scope > td, :scope > th"));
    // Linha de estado vazio ("Nenhum registro encontrado") ocupa a tabela
    // inteira com uma célula só — não é dado.
    if (tds.length < 2 && celulasCabecalho.length >= 3) continue;

    const linha = indicesMantidos.map((i) => {
      const td = tds[i];
      if (!td || ehIgnorada(td)) return null;
      return converterCelula(textoDaCelula(td), td.getAttribute("data-export-valor"));
    });
    if (linha.every((c) => c == null)) continue;
    linhas.push(linha);
  }

  if (linhas.length === 0) return null;
  return { colunas, linhas };
}

/** Tira do nome do arquivo o que o Windows recusa. */
function nomeSeguro(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 80);
}

function carimboDeData(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Gera o .xlsx e dispara o download.
 *
 * O exceljs entra por `import()` dinâmico: é uma biblioteca de ~1 MB que só faz
 * sentido no clique do botão, e assim ela fica fora do bundle inicial de todas
 * as telas que têm tabela (que é quase o software inteiro).
 */
export async function exportarXlsx(
  { colunas, linhas }: TabelaLida,
  opts: { nome: string; aba?: string },
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestor de Créditos";
  wb.created = new Date();
  // O nome da aba do Excel não aceita estes caracteres nem passa de 31.
  const aba = (opts.aba ?? opts.nome).replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Dados";
  const ws = wb.addWorksheet(aba);

  ws.addRow(colunas);
  const cabecalho = ws.getRow(1);
  cabecalho.font = { bold: true };
  cabecalho.alignment = { vertical: "middle" };
  cabecalho.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F5" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB8C0CC" } } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const linha of linhas) ws.addRow(linha);

  // Autofiltro no cabeçalho: o operador continua fatiando o dado dentro do Excel.
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: linhas.length + 1, column: colunas.length },
  };

  colunas.forEach((coluna, i) => {
    const col = ws.getColumn(i + 1);
    let largura = coluna.length;
    for (const linha of linhas) {
      const v = linha[i];
      if (v == null) continue;
      const texto = v instanceof Date ? "00/00/0000" : String(v);
      if (texto.length > largura) largura = texto.length;
    }
    col.width = Math.min(Math.max(largura + 2, 10), 48);
    if (linhas.some((l) => l[i] instanceof Date)) col.numFmt = "dd/mm/yyyy";
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nomeSeguro(opts.nome)}-${carimboDeData()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
