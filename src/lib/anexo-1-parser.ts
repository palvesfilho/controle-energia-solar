/**
 * Parser do "ANEXO 1 — SOLICITAÇÃO DE ACESSO".
 *
 * É o documento de projeto usado nas obras atendidas pela NOVA PALMA ENERGIA,
 * equivalente em conteúdo ao Anexo F da CPFL/RGE mas com formato totalmente
 * diferente: em vez de formulário com campos rotulados lado a lado, é um
 * ofício em seções numeradas (1. Dados do Consumidor, 2. Dados do Responsável
 * Técnico, ...) com alíneas a), b), c).
 *
 * ⚠️ O DOCUMENTO NÃO NOMEIA A CONCESSIONÁRIA em lugar nenhum — nem Nova Palma,
 * nem CNPJ, nem logo. Por isso a detecção é pelo TÍTULO + a estrutura das
 * seções, e `concessionaria` sai undefined (o operador escolhe no formulário).
 * Não dá pra inferir a distribuidora a partir deste PDF.
 *
 * Devolve o MESMO AnexoFData do parser da RGE, então a tela de cadastro de
 * Proprietário + Planta funciona sem alteração.
 *
 * ⚠️ VALIDADO CONTRA UMA ÚNICA AMOSTRA (Fundação Antonio Meneghetti, ago/2025).
 * Diferente do parser de fatura — que rodou em 12 documentos — aqui não há como
 * saber o que varia entre projetos (dois inversores, campo em branco, sem CREA).
 * As alíneas são lidas por rótulo, não por posição, justamente pra tolerar isso,
 * mas todo campo é opcional e o que não fechar vira aviso.
 */

export interface Anexo1Avisos {
  /** Anomalias encontradas: documento inconsistente, não erro de leitura. */
  avisos: string[];
}

interface TextItem {
  str: string;
  transform: number[];
}

async function extractLines(buffer: Uint8Array): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

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
      if (last && Math.abs(last.y - it.y) <= Y_TOLERANCE) last.items.push({ x: it.x, str: it.str });
      else clusters.push({ y: it.y, items: [{ x: it.x, str: it.str }] });
    }
    for (const cluster of clusters) {
      cluster.items.sort((a, b) => a.x - b.x);
      const line = cluster.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) allLines.push(line);
    }
  }

  await doc.destroy();
  return allLines;
}

/**
 * Detecta o Anexo 1 pelo título + estrutura (não há nome de concessionária).
 *
 * ⚠️ A checagem é deliberadamente ESTRITA. Quem chama é o parseAnexoF, então um
 * falso positivo mandaria um Anexo F da CPFL/RGE pro leitor errado. Só o título
 * não basta: "ANEXO 1" pode aparecer solto em qualquer formulário (numa lista
 * de documentos anexos, por exemplo). Por isso exigimos também as seções
 * numeradas características deste ofício — pelo menos 3 das 4.
 */
export function ehAnexo1(lines: string[]): boolean {
  const t = lines.join(" ");
  if (!/ANEXO\s*1\b/i.test(t)) return false;
  if (!/SOLICITA[ÇC][ÃA]O\s+DE\s+ACESSO/i.test(t)) return false;

  const secoes = [
    /1\.\s*Dados\s+do\s+Consumidor/i,
    /2\.\s*Dados\s+do\s+Respons[áa]vel\s+T[ée]cnico/i,
    /3\.\s*Dados\s+da\s+Unidade\s+Consumidora/i,
    /4\.\s*Dados\s+da\s+Fonte\s+Geradora/i,
  ];
  return secoes.filter((re) => re.test(t)).length >= 3;
}

/**
 * O valor de uma alínea quebra em várias linhas do PDF, então trabalhamos com o
 * texto achatado e cortamos no PRÓXIMO marcador — outra alínea "x)", um bullet
 * ou o início da próxima seção numerada.
 */
const PROXIMO_MARCADOR = String.raw`(?=\s+[a-z]\)\s|\s+•|\s+\d\.\s+Dados|\s+Inversores:|\s+Pain[ée]is|$)`;

function campo(secao: string, rotulo: string): string | undefined {
  const re = new RegExp(`${rotulo}\\s*:?\\s*(.+?)${PROXIMO_MARCADOR}`, "i");
  const m = secao.match(re);
  if (!m) return undefined;
  const v = m[1].replace(/\s+/g, " ").replace(/[;.]$/, "").trim();
  return v || undefined;
}

/** "40,0 kWp" → 40 · "56000.00 W" → 56000 */
function numero(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/-?[\d.]*\d(?:,\d+)?/);
  if (!m) return undefined;
  // pt-BR usa vírgula decimal; o documento mistura os dois (40,0 kWp × 56000.00 W).
  const s = m[0].includes(",") ? m[0].replace(/\./g, "").replace(",", ".") : m[0];
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

const FASES: Record<string, string> = { "1": "Monofásico", "2": "Bifásico", "3": "Trifásico" };

/** Confere se um CPF/CNPJ tem a quantidade certa de dígitos. */
function documentoValido(doc: string | undefined): boolean {
  if (!doc) return false;
  const d = doc.replace(/\D/g, "").length;
  return d === 11 || d === 14;
}

export interface Anexo1Extra {
  /** Pessoa de contato do cliente (seção 1, alínea d) — não é o titular. */
  responsavelCliente?: string;
  responsavelClienteCpf?: string;
  /** E-mail do responsável técnico (seção 2) — distinto do e-mail do cliente. */
  responsavelEmail?: string;
  /** Data do ofício. NÃO é a data de entrada em operação. */
  dataSolicitacao?: string;
  /** Potência unitária do módulo, em W. */
  potenciaModuloW?: number;
  /** Potência declarada na alínea "Potência nominal" da seção 4, como veio. */
  potenciaNominalDeclarada?: number;
  /** "Potência máxima da geração" declarada na seção 4, como veio. */
  potenciaMaximaGeracaoDeclarada?: number;
  areaModulosM2?: number;
  tensaoNominal?: string;
  frequenciaHz?: number;
  tipoFonte?: string;
  avisos?: string[];
}

/**
 * Extrai os dados do Anexo 1 a partir das linhas já extraídas do PDF.
 * Separado de `parseAnexo1` pra permitir teste sem PDF.
 */
export function extrairAnexo1(lines: string[]) {
  const avisos: string[] = [];
  const flat = lines.join(" ").replace(/\s+/g, " ");

  // Fatiar por seção: as alíneas a)/b)/c) se repetem em TODAS as seções, então
  // ler no texto inteiro pegaria o campo errado.
  const secoes = new Map<number, string>();
  const marcadores = [...flat.matchAll(/(\d)\.\s*Dados[^:]*:/g)];
  for (let i = 0; i < marcadores.length; i++) {
    const ini = marcadores[i].index! + marcadores[i][0].length;
    const fim = i + 1 < marcadores.length ? marcadores[i + 1].index! : flat.length;
    secoes.set(parseInt(marcadores[i][1], 10), flat.slice(ini, fim));
  }
  const sec = (n: number) => secoes.get(n) ?? "";

  // Seção 5 tem duas subseções com as mesmas alíneas (Fabricante/Modelo).
  const sec5 = sec(5);
  const iPaineis = sec5.search(/Pain[ée]is\s+Fotovoltaicos:/i);
  const blocoInversor = iPaineis >= 0 ? sec5.slice(0, iPaineis) : sec5;
  const blocoModulos = iPaineis >= 0 ? sec5.slice(iPaineis) : "";

  // ── 1. Dados do Consumidor ────────────────────────────────────────────────
  const s1 = sec(1);
  const nome = campo(s1, "Nome do titular[^:]*");
  const enderecoCompleto = campo(s1, "Endere[çc]o completo para contato");
  const cpfCnpj = campo(s1, "CPF\\/CNPJ");
  const responsavelCliente = campo(s1, "Respons[áa]vel");
  const responsavelClienteCpf = campo(s1, "CPF Respons[áa]vel");
  const telefone = campo(s1, "Telefone de contato");
  const email = campo(s1, "E-?mail");

  if (cpfCnpj && !documentoValido(cpfCnpj)) {
    avisos.push(
      `CPF/CNPJ do titular com quantidade de dígitos inválida: "${cpfCnpj}" (${cpfCnpj.replace(/\D/g, "").length} dígitos). Conferir antes de cadastrar.`,
    );
  }

  // Endereço vem numa string só: "EST RECANTO MAESTRO, S/N – OBRA TREVO -
  // INTERIOR - RESTINGA SECA/RS - CEP: 97 200-000"
  let endereco = enderecoCompleto;
  let cidade: string | undefined;
  let uf: string | undefined;
  let cep: string | undefined;
  if (enderecoCompleto) {
    const mCep = enderecoCompleto.match(/CEP:?\s*([\d\s]{2,}-?\s*\d{3})/i);
    if (mCep) cep = mCep[1].replace(/\s/g, "");
    const mCidade = enderecoCompleto.match(/([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)\s*\/\s*([A-Z]{2})\b/);
    if (mCidade) {
      cidade = mCidade[1].trim();
      uf = mCidade[2];
      endereco = enderecoCompleto.slice(0, mCidade.index).replace(/[\s\-–]+$/, "").trim();
    }
  }

  // ── 2. Dados do Responsável Técnico ───────────────────────────────────────
  const s2 = sec(2);
  const responsavelTecnico = campo(s2, "Nome");
  const responsavelTelefone = campo(s2, "Telefone de contato");
  const responsavelEmail = campo(s2, "E-?mail");
  // O conselho varia entre documentos: os de ago/2025 trazem "Nº do CREA"
  // (engenheiro) e os de nov/2025 "Nº do CFT" (técnico industrial). Aceita os
  // dois — e o CAU, por precaução — guardando qual foi.
  const mConselho = s2.match(/N[ºo°]?\s*do\s*(CREA|CFT|CAU)\b/i);
  const responsavelConselho = mConselho ? mConselho[1].toUpperCase() : undefined;
  const responsavelCrea = responsavelConselho
    ? campo(s2, `N[ºo°]?\\s*do\\s*${responsavelConselho}`)
    : undefined;

  // Registro profissional não tem forma de CPF. Nos documentos de nov/2025 o
  // campo "Nº do CFT" veio com 11 dígitos iguais ao CPF do responsável.
  if (responsavelCrea && !/[A-Za-z]/.test(responsavelCrea)) {
    const digitos = responsavelCrea.replace(/\D/g, "");
    if (digitos.length === 11) {
      avisos.push(
        `Nº do ${responsavelConselho} do responsável técnico é "${responsavelCrea}" — 11 dígitos e nenhuma letra, tem formato de CPF e não de registro profissional. Conferir.`,
      );
    }
  }

  // ── 3. Dados da Unidade Consumidora ───────────────────────────────────────
  const s3 = sec(3);
  const ucBruta = campo(s3, "N[úu]mero da unidade consumidora");
  const codigoUc = ucBruta ? ucBruta.replace(/\D/g, "") || undefined : undefined;
  let latitude: number | undefined;
  let longitude: number | undefined;
  const coord = campo(s3, "Coordenadas");
  if (coord) {
    const m = coord.match(/(-?\d+[.,]\d+)\s*,?\s*(-?\d+[.,]\d+)/);
    if (m) {
      latitude = parseFloat(m[1].replace(",", "."));
      longitude = parseFloat(m[2].replace(",", "."));
    }
  }

  // ── 4. Dados da Fonte Geradora ────────────────────────────────────────────
  const s4 = sec(4);
  const tipoFonte = campo(s4, "Tipo de fonte");
  const inversorQuantidade = numero(campo(s4, "N[ºo°]? de geradores"));
  const potenciaNominalDeclarada = numero(campo(s4, "Pot[êe]ncia nominal"));
  const modulosQuantidade = numero(campo(s4, "N[ºo°]? de pain[ée]is solares"));
  const areaModulosM2 = numero(campo(s4, "[ÁA]rea total de pain[ée]is solares"));
  const potenciaMaximaGeracaoDeclarada = numero(campo(s4, "Pot[êe]ncia m[áa]xima da gera[çc][ãa]o"));
  const tensaoNominal = campo(s4, "Tens[ãa]o nominal");
  const frequenciaHz = numero(campo(s4, "Frequ[êe]ncia"));
  const nFases = campo(s4, "N[ºo°]? de fases");
  const numeroFases = nFases ? FASES[nFases.replace(/\D/g, "")] : undefined;

  // ── 5. Equipamentos ───────────────────────────────────────────────────────
  const inversorMarca = campo(blocoInversor, "Fabricante");
  const inversorModelo = campo(blocoInversor, "Modelo");
  // "Potência máxima CA: 40000.00 W" → é a potência do inversor, em kW.
  const potenciaCaW = numero(campo(blocoInversor, "Pot[êe]ncia m[áa]xima CA"));
  const inversorPotencia = potenciaCaW != null ? potenciaCaW / 1000 : undefined;

  const modulosMarca = campo(blocoModulos, "Fabricante");
  const modulosModelo = campo(blocoModulos, "Modelo");
  const potenciaModuloW = numero(campo(blocoModulos, "Pot[êe]ncia nominal do painel"));

  // ── Potência instalada (kWp) ──────────────────────────────────────────────
  // ⚠️ Os rótulos da seção 4 NÃO seguem a convenção do sistema:
  //   "c) Potência nominal: 40,0 kWp"          → é o inversor (40 kW CA)
  //   "f) Potência máxima da geração: 37,20 kW" → é o arranjo (37,2 kWp)
  // Em todo o sistema `potenciaInstalada` é exibido como kWp (listagem de
  // usinas, mapa, portal do cliente, relatório de payback), então usamos o
  // valor DERIVADO dos módulos — que é verificável — e não o rótulo.
  let potenciaInstalada: number | undefined;
  if (modulosQuantidade != null && potenciaModuloW != null) {
    potenciaInstalada = +((modulosQuantidade * potenciaModuloW) / 1000).toFixed(3);
  } else {
    potenciaInstalada = potenciaMaximaGeracaoDeclarada;
    if (potenciaInstalada != null) {
      avisos.push(
        "Potência instalada veio do rótulo do documento (não deu pra derivar de nº de painéis × potência do painel).",
      );
    }
  }

  // Conferências cruzadas: área declarada e potência declarada.
  if (potenciaInstalada != null && potenciaMaximaGeracaoDeclarada != null) {
    if (Math.abs(potenciaInstalada - potenciaMaximaGeracaoDeclarada) > 0.05) {
      avisos.push(
        `Potência dos módulos calculada (${potenciaInstalada} kWp) diverge da "Potência máxima da geração" declarada (${potenciaMaximaGeracaoDeclarada}).`,
      );
    }
  }
  if (potenciaInstalada != null && potenciaNominalDeclarada != null) {
    if (Math.abs(potenciaInstalada - potenciaNominalDeclarada) > 0.05) {
      avisos.push(
        `"Potência nominal" declarada é ${potenciaNominalDeclarada} kWp, mas os módulos somam ${potenciaInstalada} kWp` +
          (inversorPotencia != null ? ` e o inversor é de ${inversorPotencia} kW` : "") +
          ". O rótulo do documento parece se referir ao inversor, não ao arranjo.",
      );
    }
  }

  // Data do ofício: "RESTINGA SECA/RS, 08 de AGOSTO de 2025".
  // NÃO é a data de entrada em operação — o Anexo 1 é anterior à obra.
  let dataSolicitacao: string | undefined;
  const mData = flat.match(/,\s*(\d{1,2})\s+de\s+([A-Za-zÇç]+)\s+de\s+(\d{4})/);
  if (mData) {
    const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const idx = MESES.indexOf(mData[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace("marco", "março"));
    if (idx >= 0) {
      dataSolicitacao = `${mData[1].padStart(2, "0")}/${String(idx + 1).padStart(2, "0")}/${mData[3]}`;
    }
  }

  return {
    nome,
    cpfCnpj,
    email,
    telefone,
    endereco,
    cep,
    cidade,
    uf,
    // O documento não nomeia a distribuidora — deixar em branco de propósito.
    concessionaria: undefined as string | undefined,
    codigoUc,
    latitude,
    longitude,
    modulosQuantidade,
    modulosMarca,
    modulosModelo,
    inversorQuantidade,
    inversorMarca,
    inversorModelo,
    potenciaInstalada,
    inversorPotencia,
    numeroFases,
    tipoAtendimento: undefined as string | undefined,
    responsavelTecnico,
    responsavelCrea,
    /** Qual conselho o número acima é: CREA, CFT ou CAU. */
    responsavelConselho,
    responsavelTelefone,
    // Não existe data de entrada em operação neste documento.
    dataOperacao: undefined as string | undefined,
    // Extras — a tela ignora o que não conhece.
    responsavelCliente,
    responsavelClienteCpf,
    responsavelEmail,
    dataSolicitacao,
    potenciaModuloW,
    potenciaNominalDeclarada,
    potenciaMaximaGeracaoDeclarada,
    areaModulosM2,
    tensaoNominal,
    frequenciaHz,
    tipoFonte,
    avisos,
  };
}

export async function parseAnexo1(buffer: Uint8Array) {
  const lines = await extractLines(buffer);
  return { ...extrairAnexo1(lines), rawText: lines.join("\n") };
}

export { extractLines as extractLinesAnexo1 };
