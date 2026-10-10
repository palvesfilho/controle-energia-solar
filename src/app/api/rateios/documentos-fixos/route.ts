import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile, readFromStorage, saveUploadedFile } from "@/lib/file-storage";
import { validadeCartaoCnpj } from "@/lib/cartao-cnpj";
import { hrefDoArquivo } from "@/lib/documentos-adesao";
import {
  DOCS_FIXOS,
  emissaoCartaoCnpjDoArquivo,
  lerDocFixo,
  settingDoDocFixo,
  tipoDoArquivo,
  type ChaveDocFixo,
  type DocFixoGravado,
} from "@/lib/rateio-pacote-rge";

const TAMANHO_MAXIMO = 20 * 1024 * 1024;

/**
 * GET /api/rateios/documentos-fixos — os três documentos e o que está guardado
 * de cada um. Sempre os três: o que falta aparece como falta.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const gravados = await prisma.appSetting.findMany({
    where: { key: { in: DOCS_FIXOS.map((d) => settingDoDocFixo(d.chave)) } },
  });
  const lista = [];
  for (const d of DOCS_FIXOS) {
    const key = settingDoDocFixo(d.chave);
    const g = lerDocFixo(gravados.find((s) => s.key === key)?.value);

    // Cartão enviado antes de a data de emissão existir no cadastro: lê uma vez
    // e guarda (inclusive o "não deu para ler"), para não reabrir o PDF a cada
    // visita à tela.
    if (g && d.chave === "cartao_cnpj" && g.emitidoEm === undefined) {
      const lido = await readFromStorage(g.path).catch(() => null);
      g.emitidoEm = lido ? await emissaoCartaoCnpjDoArquivo(lido.data) : null;
      await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(g) } });
    }

    lista.push({
      chave: d.chave,
      rotulo: d.rotulo,
      nome: g?.nome || null,
      enviadoEm: g?.enviadoEm || null,
      href: g ? hrefDoArquivo(g.path) : null,
      validade: g && d.chave === "cartao_cnpj" ? validadeCartaoCnpj(g.emitidoEm) : null,
    });
  }
  return NextResponse.json(lista);
}

/**
 * PATCH /api/rateios/documentos-fixos — informa À MÃO a data de emissão do
 * cartão CNPJ, para quando o arquivo é foto ou PDF escaneado e a data não pôde
 * ser lida. Body: { emitidoEm: "AAAA-MM-DD" }
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { emitidoEm?: unknown } | null;
  const emitidoEm = typeof body?.emitidoEm === "string" ? body.emitidoEm : "";
  const hoje = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emitidoEm) || Number.isNaN(Date.parse(emitidoEm)) || emitidoEm > hoje) {
    return NextResponse.json({ error: "Informe uma data de emissão válida." }, { status: 400 });
  }

  const key = settingDoDocFixo("cartao_cnpj");
  const g = lerDocFixo((await prisma.appSetting.findUnique({ where: { key } }))?.value);
  if (!g) {
    return NextResponse.json({ error: "Envie o cartão CNPJ primeiro." }, { status: 404 });
  }
  g.emitidoEm = emitidoEm;
  await prisma.appSetting.update({ where: { key }, data: { value: JSON.stringify(g) } });
  return NextResponse.json({ ok: true, validade: validadeCartaoCnpj(emitidoEm) });
}

/**
 * POST /api/rateios/documentos-fixos — envia (ou troca) um dos três documentos
 * da associação que acompanham todo rateio: CNH do Paulo, cartão CNPJ e
 * constituição da associação. Ficam em `AppSetting`, um por chave.
 *
 * multipart: chave (cnh | cartao_cnpj | constituicao) + arquivo (PDF, JPG ou PNG)
 *
 * O cadastro mora em Personalizações → Documentos da associação; a janela do
 * ZIP do rateio usa esta mesma rota para o envio rápido.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const chave = form?.get("chave");
  const arquivo = form?.get("arquivo");

  const doc = DOCS_FIXOS.find((d) => d.chave === chave);
  if (!doc) {
    return NextResponse.json({ error: "Documento desconhecido." }, { status: 400 });
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "Arquivo maior que 20 MB." }, { status: 400 });
  }
  // Pelo conteúdo, não pela extensão: o pacote só sabe juntar estes três formatos,
  // e um arquivo aceito aqui e recusado na montagem seria falha tardia e calada.
  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  if (!tipoDoArquivo(conteudo)) {
    return NextResponse.json(
      { error: "Formato não aceito. Envie PDF, JPG ou PNG." },
      { status: 400 },
    );
  }

  const key = settingDoDocFixo(doc.chave as ChaveDocFixo);
  const anterior = lerDocFixo(
    (await prisma.appSetting.findUnique({ where: { key } }))?.value,
  );

  const salvo = await saveUploadedFile(arquivo, "rateio-documentos-fixos");
  const gravado: DocFixoGravado = {
    path: salvo.relativePath,
    nome: arquivo.name,
    enviadoEm: new Date().toISOString(),
  };
  // A RGE recusa cartão CNPJ com mais de 6 meses: a data de emissão é lida do
  // próprio arquivo, na hora do envio. Null = não deu para ler (foto/escaneado).
  if (doc.chave === "cartao_cnpj") {
    gravado.emitidoEm = await emissaoCartaoCnpjDoArquivo(conteudo);
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(gravado) },
    update: { value: JSON.stringify(gravado) },
  });
  // Só depois de gravar o novo: se algo falhar antes, o antigo continua valendo.
  if (anterior && anterior.path !== gravado.path) await deleteUploadedFile(anterior.path);

  return NextResponse.json({
    ok: true,
    chave: doc.chave,
    nome: gravado.nome,
    validade: doc.chave === "cartao_cnpj" ? validadeCartaoCnpj(gravado.emitidoEm) : null,
  });
}
