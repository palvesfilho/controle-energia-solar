import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { garantirDeParaPadrao } from "@/lib/crm-sync";

const TIPOS_OBRA = new Set(["INSTALACAO", "MANUTENCAO"]);
const DESTINOS = new Set(["NENHUM", "ADESAO", "USINA_UC", "MONITORAMENTO"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await garantirDeParaPadrao();
    const linhas = await prisma.crmProdutoDestino.findMany({
      orderBy: [{ destinoGestao: "asc" }, { codigoProduto: "asc" }],
    });
    return NextResponse.json(linhas);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/produtos-destino] erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const codigoProduto = String(body.codigoProduto ?? "").trim();
  if (!codigoProduto) {
    return NextResponse.json({ error: "codigoProduto é obrigatório" }, { status: 400 });
  }

  const geraObra = Boolean(body.geraObra);
  const tipoObra = body.tipoObra ? String(body.tipoObra).toUpperCase() : null;
  const destinoGestao = String(body.destinoGestao ?? "NENHUM").toUpperCase();

  if (geraObra && (!tipoObra || !TIPOS_OBRA.has(tipoObra))) {
    return NextResponse.json(
      { error: "Quando gera obra, tipoObra deve ser INSTALACAO ou MANUTENCAO." },
      { status: 400 },
    );
  }
  if (!DESTINOS.has(destinoGestao)) {
    return NextResponse.json(
      { error: "destinoGestao deve ser NENHUM, ADESAO, USINA_UC ou MONITORAMENTO." },
      { status: 400 },
    );
  }

  const linha = await prisma.crmProdutoDestino.upsert({
    where: { codigoProduto },
    create: {
      codigoProduto,
      nomeProduto: String(body.nomeProduto ?? codigoProduto),
      geraObra,
      tipoObra: geraObra ? tipoObra : null,
      destinoGestao,
      ativo: body.ativo === undefined ? true : Boolean(body.ativo),
    },
    update: {
      geraObra,
      tipoObra: geraObra ? tipoObra : null,
      destinoGestao,
      ...(body.nomeProduto ? { nomeProduto: String(body.nomeProduto) } : {}),
      ...(body.ativo === undefined ? {} : { ativo: Boolean(body.ativo) }),
    },
  });

  return NextResponse.json(linha);
}
