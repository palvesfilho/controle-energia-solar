/**
 * Parser do Anexo F (CPFL/RGE) — formulário padrão ANEEL para
 * registro de micro/minigeradores distribuídos.
 *
 * Extrai texto do PDF via pdfjs-dist (build legacy, roda em Node)
 * e identifica os campos relevantes para cadastro de Proprietário + Planta.
 */

export interface AnexoFData {
  // Proprietário
  nome?: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  uf?: string;

  // Planta
  codigoUc?: string;
  latitude?: number;
  longitude?: number;
  concessionaria?: string;

  // Técnicos
  modulosQuantidade?: number;
  modulosMarca?: string;
  modulosModelo?: string;
  inversorQuantidade?: number;
  inversorMarca?: string;
  inversorModelo?: string;
  potenciaInstalada?: number; // kWp
  inversorPotencia?: number; // kW

  // Responsável técnico
  responsavelTecnico?: string;
  responsavelCrea?: string;
  responsavelTelefone?: string;
  dataOperacao?: string; // dd/mm/aaaa

  // Auxiliares
  numeroFases?: string; // Monofásico | Bifásico | Trifásico
  tipoAtendimento?: string; // Aéreo | Subterrâneo

  rawText?: string;
}

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * Extrai as linhas do PDF clusterizando itens por Y (tolerância dinâmica),
 * ordenando x→esquerda-direita e y→topo-base.
 *
 * No Anexo F, o label e o valor normalmente aparecem em y's separados por
 * 2pt (label=508, valor=506). Um agrupamento por arredondamento falha em
 * fronteiras de bucket — usamos clustering por distância.
 */
async function extractLines(buffer: Uint8Array): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Turbopack não empacota o pdf.worker.mjs irmão, então o fallback
  // "fake worker" do pdfjs falha em tempo de execução. Apontamos o
  // workerSrc explicitamente para o arquivo do node_modules.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const { join } = await import("node:path");
    const { pathToFileURL } = await import("node:url");
    const workerPath = join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  }

  const doc = await pdfjsLib.getDocument({
    data: buffer,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const allLines: string[] = [];
  const Y_TOLERANCE = 3;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items = (content.items as TextItem[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
      .sort((a, b) => b.y - a.y);

    const clusters: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
    for (const it of items) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) {
        last.items.push({ x: it.x, str: it.str });
      } else {
        clusters.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
      }
    }

    for (const cluster of clusters) {
      cluster.items.sort((a, b) => a.x - b.x);
      const line = cluster.items
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        // O PDF usa um caractere estranho (Ǫ, U+01EA) no lugar de Q
        // em "Quantidade" por conta do subset da fonte.
        .replace(/Ǫ\s*uantidade/gi, "Quantidade")
        .trim();
      if (line) allLines.push(line);
    }
  }

  await doc.destroy();
  return allLines;
}

/**
 * Converte coordenadas DMS ("30°1'4.4"S") em decimal.
 * S e W viram negativos.
 */
function dmsToDecimal(raw: string): number | undefined {
  const m = raw.match(
    /(\d+(?:[.,]\d+)?)\s*°\s*(\d+(?:[.,]\d+)?)\s*['\u2019]\s*(\d+(?:[.,]\d+)?)\s*["\u201d]?\s*([NSEWnsew])/,
  );
  if (!m) return undefined;
  const deg = parseFloat(m[1].replace(",", "."));
  const min = parseFloat(m[2].replace(",", "."));
  const sec = parseFloat(m[3].replace(",", "."));
  const hem = m[4].toUpperCase();
  let decimal = deg + min / 60 + sec / 3600;
  if (hem === "S" || hem === "W") decimal = -decimal;
  return Number(decimal.toFixed(6));
}

/**
 * Considera um valor "vazio" para fins de fallback:
 * string vazia, "-", asterisco solto, ou palavras de ligação que sobraram do rótulo.
 */
function isEmptyValue(v: string | undefined): boolean {
  if (!v) return true;
  const s = v.trim();
  if (!s) return true;
  if (/^[-*\s]+$/.test(s)) return true;
  if (/^(do|da|de|dos|das)$/i.test(s)) return true;
  return false;
}

/**
 * Detecta se uma linha é uma continuação/fragmento de rótulo e não um valor real.
 * Ex.: "(soma das potências nominais dos", "Inversores, kW):", "(m2):", "kWp): *".
 *
 * Cuidado para NÃO rejeitar telefones do tipo "(55) 996611333": parênteses com
 * conteúdo numérico são tratados como valores.
 */
function isLabelContinuation(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  // Parêntese iniciando com letra (explicação) → continuação
  if (/^\(\s*[A-Za-zÀ-ÿ]/.test(s)) return true;
  // Termina com "):" ou ": *" — fim de rótulo multilinha
  if (/\):\s*\*?\s*$/.test(s)) return true;
  if (/:\s*\*?\s*$/.test(s) && s.length < 40) return true;
  // Fragmentos frequentes do Anexo F
  if (/^(Registro|Consumidora|TUSD|TUSDg|Inversores|técnico|operação|fator\s+limitante)\b/i.test(s)) return true;
  if (/^kWp?\)/i.test(s)) return true;
  return false;
}

/**
 * Detecta rótulos numerados do Anexo F: "1.3)", "3.8)", "2a)", "1)".
 */
function isNumberedLabel(line: string): boolean {
  return /^\d+(\.\d+)?[a-z]?\)/i.test(line.trim());
}

/**
 * Pega o conteúdo depois de um rótulo na mesma linha
 * (ex.: "1.1) Nome do titular: * NILZA APARECIDA" → "NILZA APARECIDA").
 * Remove marcadores de pontuação e palavras de ligação que sobraram do rótulo.
 */
function afterLabel(line: string, labelRegex: RegExp): string | undefined {
  const m = line.match(labelRegex);
  if (!m) return undefined;
  let rest = line.slice(m.index! + m[0].length);
  rest = rest.replace(/^[\s:*]+/, "");
  // Palavras de ligação que continuam o rótulo (ex.: "Número do registro (CREA) do 01123...")
  rest = rest.replace(/^(do|da|de|dos|das)\s+/i, "");
  // Qualificadores entre parênteses grudados ao rótulo: "(se existente)", "(SIRGAS 2000)",
  // "(dd/mm/aaaa)", "(kWp)". Mantém parênteses numéricos como "(55)" de DDD.
  rest = rest.replace(/^\(\s*[A-Za-zÀ-ÿ][^)]*\)\s*\*?\s*/, "");
  rest = rest.replace(/^[\s:*]+/, "").trim();
  return rest || undefined;
}

/**
 * Procura por um rótulo e retorna o primeiro valor "não vazio" encontrado.
 *
 * Estratégia em cada ocorrência do rótulo:
 *   1. Mesma linha (após o rótulo).
 *   2. Próximas `maxLookahead` linhas — pula outros rótulos e continuações.
 *   3. Linhas anteriores — pula rótulos e continuações.
 *      (No Anexo F, alguns valores aparecem visualmente acima do rótulo
 *       quando o rótulo quebra em múltiplas linhas.)
 *
 * Se nada for encontrado numa ocorrência, tenta a próxima (útil quando o mesmo
 * rótulo existe em seções diferentes, ex.: SAE vs UFV).
 */
function findByLabel(
  lines: string[],
  labelRegex: RegExp,
  opts: { lookahead?: number; lookbehind?: number } = {},
): string | undefined {
  const lookahead = opts.lookahead ?? 3;
  const lookbehind = opts.lookbehind ?? 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!labelRegex.test(line)) continue;

    const inline = afterLabel(line, labelRegex);
    if (!isEmptyValue(inline) && !isLabelContinuation(inline!)) return inline;

    for (let j = 1; j <= lookahead; j++) {
      const next = lines[i + j];
      if (!next) break;
      if (isNumberedLabel(next)) continue;
      if (isLabelContinuation(next)) continue;
      if (!isEmptyValue(next)) return next.trim();
    }

    for (let j = 1; j <= lookbehind; j++) {
      const prev = lines[i - j];
      if (!prev) break;
      if (isNumberedLabel(prev)) continue;
      if (isLabelContinuation(prev)) continue;
      if (!isEmptyValue(prev)) return prev.trim();
    }
  }
  return undefined;
}

function parseIntSafe(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

function parseFloatBR(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  return parseFloat(m[0].replace(",", "."));
}

function detectConcessionaria(rawText: string): string | undefined {
  if (/\bCPFL\b/i.test(rawText)) return "CPFL";
  if (/\bRGE\b/i.test(rawText)) return "RGE";
  if (/\bENEL\b/i.test(rawText)) return "ENEL";
  if (/\bEQUATORIAL\b/i.test(rawText)) return "EQUATORIAL";
  if (/\bELEKTRO\b/i.test(rawText)) return "ELEKTRO";
  return undefined;
}

/**
 * Divide "CACHOEIRA DO SUL/RS" em { cidade, uf }.
 */
function splitCidadeUf(raw: string | undefined): { cidade?: string; uf?: string } {
  if (!raw) return {};
  const m = raw.match(/^(.+?)\s*[/\-]\s*([A-Z]{2})\b/);
  if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  return { cidade: raw.trim() };
}

export async function parseAnexoF(buffer: Uint8Array): Promise<AnexoFData> {
  const lines = await extractLines(buffer);
  const rawText = lines.join("\n");

  const data: AnexoFData = { rawText };

  data.nome = findByLabel(lines, /Nome\s+do\s+titular/i);
  data.cpfCnpj = findByLabel(lines, /CNPJ\s*ou\s*CPF\s*\(titular\)/i);
  data.codigoUc = parseIntSafe(findByLabel(lines, /N[úu]mero\s+da\s+UC/i))?.toString();
  data.endereco = findByLabel(lines, /Endere[çc]o\s+do\s+titular/i);
  data.cep = findByLabel(lines, /CEP\s+do\s+titular/i);

  const cidadeUf = splitCidadeUf(findByLabel(lines, /Munic[íi]pio\s+do\s+titular/i));
  data.cidade = cidadeUf.cidade;
  data.uf = cidadeUf.uf;

  const latRaw = findByLabel(lines, /Latitude\s*\(SIRGAS\s*2000\)/i);
  if (latRaw) data.latitude = dmsToDecimal(latRaw);
  const lonRaw = findByLabel(lines, /Longitude\s*\(SIRGAS\s*2000\)/i);
  if (lonRaw) data.longitude = dmsToDecimal(lonRaw);

  data.telefone = findByLabel(lines, /Telefone\s+do\s+titular/i);
  data.email = findByLabel(lines, /E-?mail\s+do\s+titular/i);

  data.tipoAtendimento = findByLabel(lines, /Tipo\s+de\s+Atendimento/i);
  data.numeroFases = findByLabel(lines, /N[úu]mero\s+de\s+Fases\s+da\s+Instala[çc][ãa]o/i);

  data.responsavelTecnico = findByLabel(lines, /Nome\s+do\s+respons[áa]vel\s+t[ée]cnico/i);
  data.responsavelCrea = findByLabel(lines, /N[úu]mero\s+do\s+registro\s*\(CREA\)/i);
  data.responsavelTelefone = findByLabel(
    lines,
    /N[úu]mero\s+do\s+telefone\s+do\s+respons[áa]vel\s+t[ée]cnico/i,
  );
  data.dataOperacao = findByLabel(lines, /Data\s+pretendida\s+para\s+entrada\s+em\s+opera[çc][ãa]o/i);

  // Bloco 3 — UFV
  data.modulosQuantidade = parseIntSafe(
    findByLabel(lines, /Quantidade\s+total\s+de\s+m[óo]dulos/i),
  );
  data.modulosMarca = findByLabel(lines, /Listar\s+fabricantes\s+dos\s+m[óo]dulos/i);
  data.modulosModelo = findByLabel(lines, /Listar\s+modelos\s+dos\s+m[óo]dulos/i);

  data.inversorQuantidade = parseIntSafe(
    findByLabel(lines, /Quantidade\s+total\s+de\s+inversores/i),
  );
  data.inversorMarca = findByLabel(lines, /Listar\s+fabricantes\s+dos\s+inversores/i);
  data.inversorModelo = findByLabel(lines, /Listar\s+modelos\s+dos\s+inversores/i);

  data.potenciaInstalada = parseFloatBR(
    findByLabel(lines, /Pot[êe]ncia\s+de\s+pico\s+dos\s+m[óo]dulos/i),
  );
  data.inversorPotencia = parseFloatBR(
    findByLabel(lines, /Pot[êe]ncia\s+Nominal\s+dos\s+inversores/i),
  );

  data.concessionaria = detectConcessionaria(rawText);

  return data;
}
