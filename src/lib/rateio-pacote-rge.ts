/**
 * O pacote de documentos que a RGE pede ao registrar um rateio, num ZIP só.
 *
 * Pedido do Paulo em 10/10/2026. Cinco arquivos, nesta ordem e com estes nomes:
 *
 *   1 - Identificação dos associados_Usina XXX.pdf  — identidade + procuração de
 *       cada associado do rateio, um associado depois do outro; quando o
 *       associado é empresa, o cartão CNPJ e o contrato social entram entre os dois
 *   2 - Termo de adesão_Usina XXX.pdf               — os termos de todos eles
 *   3 - CNH Paulo.pdf
 *   4 - Cartão CNPJ.pdf
 *   5 - Constituição associação.pdf
 *
 * Os dois primeiros saem dos documentos da ADESÃO guardados em cada UC (colunas
 * `doc_*`, ver [[crm-copia-documentos]]) — e, ANTES deles, dos documentos do
 * titular da USINA: a RGE quer os dois lados do rateio, quem gera e quem recebe.
 * Os da usina moram em `PlantDocument` (cartão "Documentos" da página da usina);
 * quando a usina entrou por uma venda do CRM, valem os do investidor dela. Os três últimos são da associação e
 * valem para qualquer rateio: ficam em `AppSetting`, enviados uma vez.
 *
 * 🚨 **A RGE só aceita esses documentos com o código ANTIGO da UC.** Este módulo
 * não reescreve documento assinado — o que ele faz é CONFERIR. Quem cita a UC é
 * a PROCURAÇÃO ("Tabela I – Lista das unidades consumidoras"); o termo só diz
 * "UCs: com base em procuração em anexo". Então a conferência lê o texto da
 * procuração e diz se ela traz o código antigo (10 dígitos) ou o novo (11-12).
 * Medido em 10/10/2026: as procurações assinadas até julho trazem o antigo, as
 * de agosto em diante trazem o NOVO. Essas saem no pacote do mesmo jeito, mas
 * marcadas, para ninguém descobrir pela devolução do protocolo.
 *
 * UM ARQUIVO, N UCs: um titular com várias UCs tem um contrato só (a LABIMED
 * tem 11 UCs e uma adesão). O mesmo arquivo entra UMA vez no PDF, na posição da
 * primeira UC que aponta para ele.
 *
 * Nada aqui é estimado: documento que falta aparece como falta, e o arquivo que
 * ficaria vazio não entra no ZIP.
 */
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { readFromStorage } from "@/lib/file-storage";
import { textoDoPdf } from "@/lib/crm-envelope-pdfs";
import { isCodigoUcNovo } from "@/lib/uc-codigo";
import { ucEhEmpresa } from "@/lib/rateio-documentos-uc";
import {
  cnpjDoCartao,
  dataEmissaoCartaoCnpj,
  validadeCartaoCnpj,
  type ValidadeCartaoCnpj,
} from "@/lib/cartao-cnpj";

/** Documentos da associação, iguais em todo rateio. */
export const DOCS_FIXOS = [
  { chave: "cnh", rotulo: "CNH Paulo", arquivo: "3 - CNH Paulo" },
  { chave: "cartao_cnpj", rotulo: "Cartão CNPJ", arquivo: "4 - Cartão CNPJ" },
  {
    chave: "constituicao",
    rotulo: "Constituição da associação",
    arquivo: "5 - Constituição associação",
  },
] as const;

export type ChaveDocFixo = (typeof DOCS_FIXOS)[number]["chave"];

export function settingDoDocFixo(chave: ChaveDocFixo): string {
  return `rateio.docFixo.${chave}`;
}

/** O que `AppSetting.value` guarda para cada documento fixo (JSON). */
export interface DocFixoGravado {
  path: string;
  nome: string;
  enviadoEm: string;
  /**
   * Só no cartão CNPJ: data de emissão (AAAA-MM-DD) lida do arquivo ou informada
   * à mão. `null` = já se tentou ler e não deu; `undefined` = nunca se tentou.
   */
  emitidoEm?: string | null;
  /** Só no cartão CNPJ: o CNPJ impresso nele, para o atalho da Receita. */
  cnpj?: string | null;
}

export function lerDocFixo(value: string | null | undefined): DocFixoGravado | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<DocFixoGravado>;
    return typeof v.path === "string" && v.path
      ? { path: v.path, nome: v.nome ?? "", enviadoEm: v.enviadoEm ?? "", emitidoEm: v.emitidoEm, cnpj: v.cnpj }
      : null;
  } catch {
    return null;
  }
}

/** `ilegivel` = o arquivo existe no cadastro mas não abriu (sumiu do storage ou formato estranho). */
export type EstadoDoc = "ok" | "falta" | "ilegivel";

/**
 * Qual código de UC a procuração cita. O que decide é o FORMATO do código
 * encontrado, não o campo do cadastro de onde ele veio: há UC com o código de
 * 10 dígitos ainda gravado em `codigoUc`.
 *   antigo    — cita o código antigo: é o que a RGE aceita
 *   novo      — cita só o código novo: risco de devolução
 *   nenhum    — tem texto, mas nenhum código desta UC aparece
 *   sem_texto — PDF escaneado ou imagem: não dá para conferir por aqui
 */
export type CitaUc = "antigo" | "novo" | "nenhum" | "sem_texto";

export interface AssociadoConferencia {
  consumerUnitId: string;
  nome: string;
  /** CPF/CNPJ do cadastro da UC — alimenta o atalho da Receita no cartão vencido. */
  cpfCnpj: string | null;
  codigoUc: string | null;
  /**
   * O código que a RGE quer ver: `codigoUcAntigo`, ou o próprio `codigoUc`
   * quando ele ainda está no formato de 10 dígitos. Null = o cadastro não tem.
   */
  codigoAntigo: string | null;
  identidade: EstadoDoc;
  /** Só para empresa. Null = pessoa física, o documento não se aplica. */
  cartaoCnpj: EstadoDoc | null;
  /**
   * A RGE recusa cartão CNPJ emitido há mais de 6 meses — vale para o do
   * associado também. Null quando não há cartão para conferir.
   */
  cartaoCnpjValidade: ValidadeCartaoCnpj | null;
  contratoSocial: EstadoDoc | null;
  procuracao: EstadoDoc;
  termo: EstadoDoc;
  procuracaoCita: CitaUc | null;
}

/** Os documentos do titular da usina — o lado que GERA os créditos. */
export interface UsinaConferencia {
  plantId: string;
  cpfCnpj: string | null;
  identidade: EstadoDoc;
  /** Só para empresa. Null = pessoa física, o documento não se aplica. */
  cartaoCnpj: EstadoDoc | null;
  cartaoCnpjValidade: ValidadeCartaoCnpj | null;
  contratoSocial: EstadoDoc | null;
  procuracao: EstadoDoc;
  termo: EstadoDoc;
}

export interface ConferenciaPacoteRge {
  usina: string;
  documentosUsina: UsinaConferencia;
  associados: AssociadoConferencia[];
  fixos: {
    chave: ChaveDocFixo;
    rotulo: string;
    estado: EstadoDoc;
    nome: string | null;
    enviadoEm: string | null;
    /** Só no cartão CNPJ da associação. */
    validade: ValidadeCartaoCnpj | null;
    cnpj: string | null;
  }[];
  /** Os arquivos que entram no ZIP. */
  arquivos: string[];
  /** Quantas coisas pedem atenção antes de subir na RGE. */
  pendencias: number;
}

const A4 = { largura: 595.28, altura: 841.89, margem: 28 };

function nomeSeguro(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

export function tipoDoArquivo(b: Buffer): "pdf" | "jpg" | "png" | null {
  if (b.length >= 4 && b.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

/**
 * Qualquer documento vira PDF: o PDF abre como está, a foto (identidade
 * fotografada no celular é comum) vira uma página A4 com a imagem encaixada.
 * Null = formato que não dá para juntar.
 */
async function comoPdf(bytes: Buffer): Promise<PDFDocument | null> {
  const tipo = tipoDoArquivo(bytes);
  if (tipo === "pdf") {
    // PDF assinado costuma vir com restrição de edição; copiar páginas não a viola.
    return PDFDocument.load(bytes, { ignoreEncryption: true });
  }
  if (tipo === "jpg" || tipo === "png") {
    const doc = await PDFDocument.create();
    const img = tipo === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    const maxL = A4.largura - 2 * A4.margem;
    const maxA = A4.altura - 2 * A4.margem;
    const escala = Math.min(maxL / img.width, maxA / img.height);
    const l = img.width * escala;
    const a = img.height * escala;
    const page = doc.addPage([A4.largura, A4.altura]);
    page.drawImage(img, { x: (A4.largura - l) / 2, y: (A4.altura - a) / 2, width: l, height: a });
    return doc;
  }
  return null;
}

/**
 * Data de emissão do cartão CNPJ lida do próprio arquivo. Null quando é foto,
 * PDF escaneado, ou um PDF que não é o comprovante da Receita.
 */
export async function emissaoCartaoCnpjDoArquivo(bytes: Buffer): Promise<string | null> {
  return (await lerCartaoCnpjDoArquivo(bytes)).emitidoEm;
}

/** Data de emissão e CNPJ impressos no cartão. Os dois null em arquivo sem texto. */
export async function lerCartaoCnpjDoArquivo(
  bytes: Buffer,
): Promise<{ emitidoEm: string | null; cnpj: string | null }> {
  if (tipoDoArquivo(bytes) !== "pdf") return { emitidoEm: null, cnpj: null };
  const texto = await textoDoPdf(bytes).catch(() => "");
  return { emitidoEm: dataEmissaoCartaoCnpj(texto), cnpj: cnpjDoCartao(texto) };
}

function soCodigo(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Procura os códigos da UC no texto do documento. A pontuação sai dos dois
 * lados ("1.582.360.001-72" e "158236000172" são o mesmo código), mas os
 * espaços ficam: sem eles, dois números vizinhos se colariam num código falso.
 */
function qualCodigoCita(texto: string, codigos: string[]): CitaUc {
  const limpo = texto.replace(/[.\-/]/g, "");
  if (!limpo.trim()) return "sem_texto";
  const citados = codigos.filter((c) => c && limpo.includes(c));
  if (citados.length === 0) return "nenhum";
  return citados.some((c) => !isCodigoUcNovo(c)) ? "antigo" : "novo";
}

function cartaoPedeAtencao(v: ValidadeCartaoCnpj | null): boolean {
  return v?.situacao === "vencido" || v?.situacao === "vencendo";
}

export interface PacoteRge {
  conferencia: ConferenciaPacoteRge;
  nomeZip: string;
  /** Só quando `gerarZip` foi pedido. */
  zip: Buffer | null;
}

export async function montarPacoteRge(
  plantId: string,
  consumerUnitIds: string[],
  opcoes: { gerarZip: boolean },
): Promise<PacoteRge | null> {
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      name: true,
      cpfCnpj: true,
      documents: { select: { type: true, url: true } },
      investors: {
        select: {
          investor: {
            select: {
              docIdentidade: true,
              docCartaoCnpj: true,
              docContratoSocial: true,
              docProcuracao: true,
              docTermoAdesao: true,
            },
          },
        },
      },
    },
  });
  if (!plant) return null;

  // origem-ok: busca por id das UCs que JÁ estão no rateio — quem decide quais entram é a tela do rateio, não esta consulta.
  const encontradas = await prisma.consumerUnit.findMany({
    where: { id: { in: consumerUnitIds } },
    select: {
      id: true,
      nome: true,
      codigoUc: true,
      codigoUcAntigo: true,
      cpfCnpj: true,
      docIdentidade: true,
      docCartaoCnpj: true,
      docContratoSocial: true,
      docProcuracao: true,
      docTermoAdesao: true,
    },
  });
  // Na ordem em que o rateio lista as UCs — é a ordem que o operador vê na tela.
  const porId = new Map(encontradas.map((u) => [u.id, u]));
  const ucs = consumerUnitIds.flatMap((id) => porId.get(id) ?? []);

  // Cada arquivo é lido UMA vez, por mais UCs que apontem para ele, e todos em
  // paralelo: são dezenas de leituras no storage, e em fila a janela demorava.
  const lidos = new Map<string, Promise<Buffer | null>>();
  const ler = (path: string) => {
    let p = lidos.get(path);
    if (!p) {
      p = readFromStorage(path)
        .then((r) => r?.data ?? null)
        .catch(() => null);
      lidos.set(path, p);
    }
    return p;
  };
  await Promise.all(
    ucs
      .flatMap((u) => [
        u.docIdentidade,
        u.docCartaoCnpj,
        u.docContratoSocial,
        u.docProcuracao,
        u.docTermoAdesao,
      ])
      .flatMap((p) => (p ? [ler(p)] : [])),
  );

  const identificacao = await PDFDocument.create();
  const termos = await PDFDocument.create();
  const jaEntrou = { identificacao: new Set<string>(), termos: new Set<string>() };
  const estados = new Map<string, EstadoDoc>();

  // Na conferência basta saber se o arquivo existe e é de um formato que dá para
  // juntar; abrir e copiar página por página fica para quando o ZIP é pedido.
  const anexar = async (
    destino: PDFDocument,
    vistos: Set<string>,
    path: string | null,
  ): Promise<EstadoDoc> => {
    if (!path) return "falta";
    const conhecido = estados.get(path);
    if (conhecido && (conhecido !== "ok" || vistos.has(path))) return conhecido;

    const bytes = await ler(path);
    let estado: EstadoDoc = bytes && tipoDoArquivo(bytes) ? "ok" : "ilegivel";
    if (estado === "ok" && opcoes.gerarZip) {
      const pdf = await comoPdf(bytes!).catch(() => null);
      if (pdf) {
        const paginas = await destino.copyPages(pdf, pdf.getPageIndices());
        paginas.forEach((p) => destino.addPage(p));
      } else {
        estado = "ilegivel";
      }
    }
    if (estado === "ok") vistos.add(path);
    estados.set(path, estado);
    return estado;
  };

  const textos = new Map<string, Promise<string>>();
  const textoDe = (path: string, bytes: Buffer) => {
    let t = textos.get(path);
    if (!t) {
      t = tipoDoArquivo(bytes) === "pdf" ? textoDoPdf(bytes).catch(() => "") : Promise.resolve("");
      textos.set(path, t);
    }
    return t;
  };

  // ── A usina primeiro: é quem gera, e abre os dois PDFs. ──
  // O arquivo enviado na página da usina manda; sem ele, vale o do investidor
  // (usina que entrou por venda do CRM traz a papelada da adesão dele).
  type CampoDoc =
    | "docIdentidade"
    | "docCartaoCnpj"
    | "docContratoSocial"
    | "docProcuracao"
    | "docTermoAdesao";
  const docDaUsina = (tipo: string, campo: CampoDoc): string | null =>
    plant.documents.find((d) => d.type === tipo)?.url ??
    plant.investors.map((i) => i.investor[campo]).find((v): v is string => Boolean(v)) ??
    null;
  const pathsUsina = {
    identidade: docDaUsina("CNH_RG", "docIdentidade"),
    cartaoCnpj: docDaUsina("CARTAO_CNPJ", "docCartaoCnpj"),
    contratoSocial: docDaUsina("CONTRATO_SOCIAL", "docContratoSocial"),
    procuracao: docDaUsina("PROCURACAO", "docProcuracao"),
    termo: docDaUsina("TERMO_ADESAO", "docTermoAdesao"),
  };
  const usinaEhEmpresa = ucEhEmpresa({
    cpfCnpj: plant.cpfCnpj,
    docCartaoCnpj: pathsUsina.cartaoCnpj,
    docContratoSocial: pathsUsina.contratoSocial,
  });
  const usinaIdentidade = await anexar(identificacao, jaEntrou.identificacao, pathsUsina.identidade);
  const usinaCartao = usinaEhEmpresa
    ? await anexar(identificacao, jaEntrou.identificacao, pathsUsina.cartaoCnpj)
    : null;
  const usinaContrato = usinaEhEmpresa
    ? await anexar(identificacao, jaEntrou.identificacao, pathsUsina.contratoSocial)
    : null;
  const usinaProcuracao = await anexar(identificacao, jaEntrou.identificacao, pathsUsina.procuracao);
  const usinaTermo = await anexar(termos, jaEntrou.termos, pathsUsina.termo);
  const bytesCartaoUsina = usinaCartao === "ok" ? await ler(pathsUsina.cartaoCnpj!) : null;
  const documentosUsina: UsinaConferencia = {
    plantId,
    cpfCnpj: plant.cpfCnpj,
    identidade: usinaIdentidade,
    cartaoCnpj: usinaCartao,
    cartaoCnpjValidade: bytesCartaoUsina
      ? validadeCartaoCnpj(
          dataEmissaoCartaoCnpj(await textoDe(pathsUsina.cartaoCnpj!, bytesCartaoUsina)),
        )
      : null,
    contratoSocial: usinaContrato,
    procuracao: usinaProcuracao,
    termo: usinaTermo,
  };

  const associados: AssociadoConferencia[] = [];
  for (const u of ucs) {
    const novo = soCodigo(u.codigoUc);
    const antigo = soCodigo(u.codigoUcAntigo);

    // Ordem pedida: identidade e, logo em seguida, a procuração do MESMO associado.
    // Na empresa, os documentos dela ficam no meio — tudo o que identifica o
    // associado vem antes do mandato que ele assina.
    const identidade = await anexar(identificacao, jaEntrou.identificacao, u.docIdentidade);
    const empresa = ucEhEmpresa(u);
    const cartaoCnpj = empresa
      ? await anexar(identificacao, jaEntrou.identificacao, u.docCartaoCnpj)
      : null;
    const contratoSocial = empresa
      ? await anexar(identificacao, jaEntrou.identificacao, u.docContratoSocial)
      : null;
    const procuracao = await anexar(identificacao, jaEntrou.identificacao, u.docProcuracao);
    const termo = await anexar(termos, jaEntrou.termos, u.docTermoAdesao);

    const bytesProcuracao = procuracao === "ok" ? await ler(u.docProcuracao!) : null;
    const bytesCartao = cartaoCnpj === "ok" ? await ler(u.docCartaoCnpj!) : null;

    associados.push({
      consumerUnitId: u.id,
      nome: u.nome,
      cpfCnpj: u.cpfCnpj,
      codigoUc: u.codigoUc,
      codigoAntigo: u.codigoUcAntigo || (novo && !isCodigoUcNovo(novo) ? u.codigoUc : null),
      identidade,
      cartaoCnpj,
      cartaoCnpjValidade: bytesCartao
        ? validadeCartaoCnpj(dataEmissaoCartaoCnpj(await textoDe(u.docCartaoCnpj!, bytesCartao)))
        : null,
      contratoSocial,
      procuracao,
      termo,
      procuracaoCita: bytesProcuracao
        ? qualCodigoCita(await textoDe(u.docProcuracao!, bytesProcuracao), [novo, antigo])
        : null,
    });
  }

  // Os três da associação.
  const gravados = await prisma.appSetting.findMany({
    where: { key: { in: DOCS_FIXOS.map((d) => settingDoDocFixo(d.chave)) } },
  });
  const fixos: ConferenciaPacoteRge["fixos"] = [];
  const arquivosFixos: { nome: string; dados: Uint8Array }[] = [];
  for (const d of DOCS_FIXOS) {
    const g = lerDocFixo(gravados.find((s) => s.key === settingDoDocFixo(d.chave))?.value);
    if (!g) {
      fixos.push({ chave: d.chave, rotulo: d.rotulo, estado: "falta", nome: null, enviadoEm: null, validade: null, cnpj: null });
      continue;
    }
    const bytes = await ler(g.path);
    const tipo = bytes ? tipoDoArquivo(bytes) : null;
    // A data gravada no cadastro manda (pode ter sido informada à mão para um
    // cartão escaneado); sem ela, lê do arquivo.
    const validade =
      d.chave === "cartao_cnpj"
        ? validadeCartaoCnpj(
            g.emitidoEm ?? (bytes ? await emissaoCartaoCnpjDoArquivo(bytes) : null),
          )
        : null;
    fixos.push({
      chave: d.chave,
      rotulo: d.rotulo,
      estado: tipo ? "ok" : "ilegivel",
      nome: g.nome || null,
      enviadoEm: g.enviadoEm || null,
      validade,
      cnpj: g.cnpj ?? null,
    });
    if (bytes && tipo) {
      // PDF segue byte a byte como foi enviado; só a foto é que precisa virar PDF.
      let dados: Uint8Array = new Uint8Array(bytes);
      if (tipo !== "pdf" && opcoes.gerarZip) {
        const pdf = await comoPdf(bytes).catch(() => null);
        if (pdf) dados = await pdf.save();
      }
      arquivosFixos.push({ nome: `${d.arquivo}.pdf`, dados });
    }
  }

  const usina = nomeSeguro(plant.name);
  // Arquivo que ficaria vazio não entra: PDF sem página nenhuma não é documento.
  const montados = [
    {
      nome: `1 - Identificação dos associados_Usina ${usina}.pdf`,
      doc: identificacao,
      temConteudo: jaEntrou.identificacao.size > 0,
    },
    {
      nome: `2 - Termo de adesão_Usina ${usina}.pdf`,
      doc: termos,
      temConteudo: jaEntrou.termos.size > 0,
    },
  ].filter((m) => m.temConteudo);

  const arquivos = [...montados.map((m) => m.nome), ...arquivosFixos.map((f) => f.nome)];

  const pendencias =
    associados.reduce(
      (s, a) =>
        s +
        [a.identidade, a.cartaoCnpj, a.contratoSocial, a.procuracao, a.termo].filter(
          (e) => e !== null && e !== "ok",
        ).length +
        (a.codigoAntigo ? 0 : 1) +
        (a.procuracaoCita === "novo" ? 1 : 0) +
        (cartaoPedeAtencao(a.cartaoCnpjValidade) ? 1 : 0),
      0,
    ) +
    fixos.filter((f) => f.estado !== "ok" || cartaoPedeAtencao(f.validade)).length +
    [
      documentosUsina.identidade,
      documentosUsina.cartaoCnpj,
      documentosUsina.contratoSocial,
      documentosUsina.procuracao,
      documentosUsina.termo,
    ].filter((e) => e !== null && e !== "ok").length +
    (cartaoPedeAtencao(documentosUsina.cartaoCnpjValidade) ? 1 : 0);

  let zip: Buffer | null = null;
  if (opcoes.gerarZip) {
    const z = new JSZip();
    for (const m of montados) z.file(m.nome, await m.doc.save());
    for (const f of arquivosFixos) z.file(f.nome, f.dados);
    // Sem compressão: PDF e foto já são comprimidos, e comprimir de novo só
    // gasta tempo para tirar 1% do tamanho.
    zip = await z.generateAsync({ type: "nodebuffer", compression: "STORE" });
  }

  return {
    conferencia: { usina: plant.name, documentosUsina, associados, fixos, arquivos, pendencias },
    nomeZip: `Documentos RGE - Usina ${usina}.zip`,
    zip,
  };
}
