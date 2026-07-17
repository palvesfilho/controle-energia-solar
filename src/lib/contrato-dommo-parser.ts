/**
 * Parser do contrato Dommo Soluções de gestão/intermediação de usina
 * fotovoltaica assinado com investidor (dono da usina).
 *
 * Template observado (out/2024 em diante): 3 páginas — partes/objeto na p.1,
 * cláusulas na p.2, assinaturas + anexo "Proposta Comercial" na p.3. As
 * versões Clicksign acrescentam páginas de selo de assinatura ao final, sem
 * alterar o miolo.
 *
 * Extrai:
 *   - Identificação da contratante (PF/PJ, CPF/CNPJ, endereço)
 *   - Valor mensal de gestão fixa (cláusula 4.1)
 *   - Prazo e antecedência de rescisão (cláusula 5)
 *   - Foro (cláusula 8.1)
 *   - Data de assinatura
 *   - Anexo Proposta Comercial: R$/kWh, potência instalada (kWp), geração
 *     média esperada (kWh/mês)
 *
 * Pattern de pdfjs idêntico ao fatura-pdf-parser. SEMPRE clonar o buffer com
 * arrayBuffer.slice(0) antes de passar pro pdfjs (ele dreina o ArrayBuffer e
 * o caller perde os bytes — bug observado no parser de faturas).
 */

interface TextItem {
  str: string;
  transform: number[];
}

async function extractText(buffer: Uint8Array): Promise<string> {
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

  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[])
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines: string[] = [];
    const Y_TOL = 3;
    let curY: number | null = null;
    let cur: Array<{ x: number; str: string }> = [];
    for (const it of items) {
      if (curY === null || Math.abs(curY - it.y) > Y_TOL) {
        if (cur.length) {
          cur.sort((a, b) => a.x - b.x);
          lines.push(cur.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim());
        }
        cur = [{ x: it.x, str: it.str }];
        curY = it.y;
      } else {
        cur.push({ x: it.x, str: it.str });
      }
    }
    if (cur.length) {
      cur.sort((a, b) => a.x - b.x);
      lines.push(cur.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim());
    }
    pages.push(lines.join("\n"));
  }
  await doc.destroy();
  return pages.join("\n\n").replace(/ /g, " ");
}

function parseNumBR(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function parseDataExtenso(s: string): Date | null {
  // ex: "29 de outubro de 2024"
  const m = s.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = MESES[m[2].toLowerCase()];
  const ano = Number(m[3]);
  if (!mes) return null;
  // UTC noon — pattern do projeto pra datas "calendar-only" evitar drift de TZ
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function isValidCPF(digits: string): boolean {
  return /^\d{11}$/.test(digits);
}

function isValidCNPJ(digits: string): boolean {
  return /^\d{14}$/.test(digits);
}

/**
 * Localiza o bloco da CONTRATANTE — texto entre "denominada CONTRATADA e ;"
 * e "doravante denominada CONTRATANTE". Pega APENAS o bloco da CONTRATANTE
 * pra evitar capturar CPF/CNPJ/endereço da Dommo (que aparecem antes).
 */
function extractContratanteBlock(text: string): string | null {
  const endIdx = text.search(/doravante\s+denominad[ao]\s+CONTRATANTE/i);
  if (endIdx < 0) return null;
  // Match "denominada CONTRATADA e ;" ou "denominada CONTRATADA e;" ou similar.
  const startMatch = text.slice(0, endIdx).match(/denominad[ao]\s+CONTRATADA\s*e\s*;/i);
  if (!startMatch) return null;
  const start = startMatch.index! + startMatch[0].length;
  return text.slice(start, endIdx);
}

export interface ContratoDommoExtraction {
  // Contratante (investidor)
  contratante: {
    tipo: "PF" | "PJ" | "DESCONHECIDO";
    nome: string | null;
    cpf: string | null;              // só dígitos. Em PJ é do sócio representante.
    cnpj: string | null;             // só dígitos (PJ)
    socioRepresentante: string | null; // em PJ: nome do sócio representante
    endereco: string | null;     // rua + número
    cep: string | null;          // só dígitos
    cidade: string | null;
    uf: string | null;
  };
  // Cláusulas financeiras
  gestaoFixaMensal: number | null;     // R$/mês (cláusula 4.1)
  valorKwh: number | null;             // R$/kWh (anexo)
  // Especificações técnicas (anexo)
  potenciaInstaladaKwp: number | null;
  geracaoMediaMensalKwh: number | null;
  // Prazo e foro
  prazoMeses: number | null;
  marcoInicioPrazo: string | null;
  antecedenciaRescisaoDias: number | null;
  foro: string | null;
  // Assinatura
  dataAssinatura: Date | null;
  // Texto puro (debug)
  rawText: string;
  // Avisos do parser
  warnings: string[];
}

export async function parseContratoDommo(
  buffer: Uint8Array,
): Promise<ContratoDommoExtraction> {
  const text = await extractText(buffer);
  const warnings: string[] = [];

  // ---- Contratante ---------------------------------------------------------
  const block = extractContratanteBlock(text);
  if (!block) warnings.push("bloco da CONTRATANTE não localizado");

  // CNPJ: aceita "CNPJ sob o nº", "CNPJ nº", ou só "CNPJ "
  const cnpjMatch = block?.match(
    /CNPJ\s*(?:sob\s*o\s*)?(?:n[°ºo.]?\s*)?([\d.\/\-\s]{14,22})/i,
  );
  // CPF: aceita "CPF sob o n°", "CPF nº", "CPF "
  const cpfMatch = block?.match(
    /CPF\s*(?:sob\s*o\s*)?(?:n[°ºo.]?\s*)?([\d.\s-]{11,17})/i,
  );

  let cnpj: string | null = null;
  let cpf: string | null = null;
  if (cnpjMatch) {
    const d = onlyDigits(cnpjMatch[1]);
    if (isValidCNPJ(d)) cnpj = d;
  }
  if (cpfMatch) {
    const d = onlyDigits(cpfMatch[1]);
    if (isValidCPF(d)) cpf = d;
  }

  const tipo: "PF" | "PJ" | "DESCONHECIDO" =
    cnpj ? "PJ" : cpf ? "PF" : "DESCONHECIDO";

  // Nome: aparece como o token em ALL CAPS antes de "pessoa física",
  // "pessoa jurídica", "sociedade" ou "empresa". Padrão dos templates
  // observados (PF, PJ, PJ-representada).
  let nome: string | null = null;
  if (block) {
    // Pega tudo desde o início do block até o primeiro qualificador.
    const m = block.match(
      /^\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s&.\-]{4,90}?)\s*,\s+(?:pessoa\s+(?:f[ií]sica|jur[íi]dica)|sociedade)/,
    );
    if (m) {
      nome = m[1].trim().replace(/\s+/g, " ");
    }
  }
  if (!nome) warnings.push("nome da CONTRATANTE não localizado");

  // PJ representada por sócio: "representada pelo sócio NOME EM CAPS , pessoa física"
  // ou "representada por Renan Giacomeli, física inscrita no CPF" (sem "pelo sócio")
  let socioRepresentante: string | null = null;
  if (block && tipo === "PJ") {
    const m = block.match(
      /representad[oa]\s+(?:pelo\s+s[óo]cio\s+)?(?:por\s+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.\-]{4,80}?)\s*,\s+(?:pessoa\s+)?f[ií]sica/,
    );
    if (m) socioRepresentante = m[1].trim().replace(/\s+/g, " ");
  }

  // Endereço — várias variações:
  //   1) "endereço à RUA, nº N, CIDADE/UF, CEP X"
  //   2) "endereço à RUA, N, CIDADE/UF, CEP X"
  //   3) "endereço à RUA, NÚMERO N, BAIRRO B, CEP X, na cidade de CIDADE/UF"
  //   4) "endereço à RUA, N, BAIRRO B" (sem cidade/CEP explícitos)
  let endereco: string | null = null;
  let cep: string | null = null;
  let cidade: string | null = null;
  let uf: string | null = null;
  if (block) {
    // Captura tudo da palavra "endereço à" até o "doravante" (fim do block).
    const m = block.match(/endere[cç]o\s+[àáa]\s+([^]+?)$/i);
    if (m) {
      const enderecoCompleto = m[1].replace(/\s+/g, " ").trim();

      // Rua + número: primeira parte até a primeira vírgula.
      const parts = enderecoCompleto.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        endereco = `${parts[0]}, ${parts[1]}`;
      } else {
        endereco = parts[0];
      }

      // Cidade/UF: procurar padrão "CIDADE/UF" em qualquer lugar.
      const cidUfMatch = enderecoCompleto.match(
        /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]+?)\/([A-Z]{2})\b/,
      );
      if (cidUfMatch) {
        // Remove prefixos comuns que prendem na frente: "na cidade de", "no
        // Município de", "cidade de", "Município de". Captura o nome puro.
        cidade = cidUfMatch[1]
          .replace(/^(?:no\s+|na\s+)?(?:Munic[íi]pio|cidade)\s+de\s+/i, "")
          .trim();
        uf = cidUfMatch[2].trim();
      }

      // CEP: procurar padrão CEP em qualquer lugar.
      const cepMatch = enderecoCompleto.match(/CEP[:\s]+([\d.\-\s]{8,12})/i);
      if (cepMatch) {
        const d = onlyDigits(cepMatch[1]);
        if (/^\d{8}$/.test(d)) cep = d;
      }
    }
    if (!endereco) warnings.push("endereço da CONTRATANTE não localizado");
    else if (!cidade || !cep) {
      warnings.push(
        `endereço parcial (cidade=${cidade ?? "—"} cep=${cep ?? "—"})`,
      );
    }
  }

  // ---- Cláusulas financeiras ----------------------------------------------
  // Dois modelos observados:
  //  - Antigo (out/2024 → mar/2025): "A CONTRATANTE deverá realizar o pagamento
  //    mensal de R$ X" — gestão fixa; o R$/kWh vem no anexo Proposta Comercial.
  //  - Novo (jun/2025+): "A CONTRATADA deverá realizar o pagamento de R$ X
  //    para cada kWh compensado e pago" — sem gestão fixa, R$/kWh embutido.
  let gestaoFixaMensal: number | null = null;
  const gestaoMatch = text.match(
    /CONTRATANTE\s+dever[áa]\s+realizar\s+o\s+pagamento\s+mensal\s+de\s+R\$\s*([\d.,]+)/i,
  );
  if (gestaoMatch) {
    gestaoFixaMensal = parseNumBR(gestaoMatch[1]);
  }

  let valorKwh: number | null = null;
  // Modelo novo: cláusula 4.1 — "pagamento de R$ X para cada kWh"
  const kwhClausula = text.match(
    /pagamento\s+de\s+R\$\s*([\d.,]+)\s+para\s+cada\s+kWh/i,
  );
  if (kwhClausula) {
    valorKwh = parseNumBR(kwhClausula[1]);
  } else {
    // Modelo antigo: anexo Proposta Comercial — "Kw/h negociado ... : R$ X"
    const kwhAnexo = text.match(/Kw\/h\s+negociado[^:]*:\s*R\$\s*([\d.,]+)/i);
    if (kwhAnexo) valorKwh = parseNumBR(kwhAnexo[1]);
  }

  if (gestaoFixaMensal == null && valorKwh == null) {
    warnings.push("nenhum valor financeiro localizado (gestão fixa nem R$/kWh)");
  }

  // Anexo Proposta Comercial — só nos contratos antigos. Quando não tem,
  // não é erro: emitimos warning leve só se também não pegou R$/kWh.
  const temAnexo = /ANEXO[\s\S]{0,200}Proposta\s+Comercial/i.test(text);

  // Potência instalada UFV: "Potência instalada de UFV: 90,72 kWp"
  let potenciaInstaladaKwp: number | null = null;
  const potMatch = text.match(/Pot[êe]ncia\s+instalada\s+de\s+UFV\s*:\s*([\d.,]+)\s*kWp/i);
  if (potMatch) potenciaInstaladaKwp = parseNumBR(potMatch[1]);

  // Geração média: "Geração média esperada da UFV: 10800 kWh/mês"
  let geracaoMediaMensalKwh: number | null = null;
  const geraMatch = text.match(/Gera[çc][ãa]o\s+m[ée]dia\s+esperada[^:]*:\s*([\d.,]+)\s*kWh/i);
  if (geraMatch) geracaoMediaMensalKwh = parseNumBR(geraMatch[1]);

  if (!temAnexo) {
    warnings.push("contrato sem anexo Proposta Comercial (potência/geração não disponíveis)");
  } else {
    if (potenciaInstaladaKwp == null) warnings.push("potência instalada (kWp) não localizada apesar de ter anexo");
    if (geracaoMediaMensalKwh == null) warnings.push("geração média (kWh/mês) não localizada apesar de ter anexo");
  }

  // ---- Prazo e foro --------------------------------------------------------
  let prazoMeses: number | null = null;
  const prazoMatch = text.match(/prazo\s+de\s+(\d{1,3})\s+meses/i);
  if (prazoMatch) {
    prazoMeses = Number(prazoMatch[1]);
  }

  let marcoInicioPrazo: string | null = null;
  if (/êxito\s+do\s+cr[ée]dito|exito\s+do\s+credito/i.test(text)) {
    marcoInicioPrazo = "êxito do crédito à conta de energia elétrica dos terceiros beneficiários";
  }

  let antecedenciaRescisaoDias: number | null = null;
  const antecMatch = text.match(/com\s+pelo\s+menos\s+(\d{1,4})\s+dias?\s+[úu]teis/i);
  if (antecMatch) {
    antecedenciaRescisaoDias = Number(antecMatch[1]);
  }

  let foro: string | null = null;
  const foroMatch = text.match(/Foro\s+da\s+Comarca\s+de\s+([A-Za-zÀ-ÿ\s]+?)\/([A-Z]{2})/);
  if (foroMatch) {
    foro = `${foroMatch[1].trim()}/${foroMatch[2].trim()}`;
  }

  // ---- Data assinatura -----------------------------------------------------
  // Aparece no formato "Santa Maria/RS, 29 de outubro de 2024."
  let dataAssinatura: Date | null = null;
  const dataMatch = text.match(/([A-Za-zÀ-ÿ\s]+\/[A-Z]{2}),\s*(\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/i);
  if (dataMatch) {
    dataAssinatura = parseDataExtenso(dataMatch[2]);
  }
  if (!dataAssinatura) warnings.push("data de assinatura não localizada");

  return {
    contratante: { tipo, nome, cpf, cnpj, socioRepresentante, endereco, cep, cidade, uf },
    gestaoFixaMensal,
    valorKwh,
    potenciaInstaladaKwp,
    geracaoMediaMensalKwh,
    prazoMeses,
    marcoInicioPrazo,
    antecedenciaRescisaoDias,
    foro,
    dataAssinatura,
    rawText: text,
    warnings,
  };
}
