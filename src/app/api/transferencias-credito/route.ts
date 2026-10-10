import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { SEM_UC_BRASIL_SOLAR } from "@/lib/uc-origem";
import { validarEntrada } from "@/lib/transferencia-creditos";
import { carregarTransferencias } from "@/lib/transferencia-creditos-db";

/**
 * GET  /api/transferencias-credito — todas as transferências de crédito, com o
 *      acompanhamento das faturas de cada destino, e as opções do formulário
 *      (usinas e UCs) para a tela não precisar de outra ida ao servidor.
 * POST /api/transferencias-credito — registra uma transferência.
 *
 * Só cadastro e acompanhamento: nada aqui gera repasse ao investidor nem mexe
 * na cobrança do cliente.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const [transferencias, usinas, ucs] = await Promise.all([
    carregarTransferencias(),
    prisma.plant.findMany({
      where: { active: true },
      select: { id: true, name: true, unidadeConsumidora: true, unidadeConsumidoraAntiga: true, numeroUsina: true },
      orderBy: { name: "asc" },
    }),
    // Destino de transferência é cliente da associação: UC da rede Brasil Solar fica de fora.
    prisma.consumerUnit.findMany({
      where: { active: true, ...SEM_UC_BRASIL_SOLAR },
      select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true, cidade: true, distribuidora: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return NextResponse.json({ transferencias, opcoes: { usinas, ucs } });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const v = validarEntrada(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.erros.join(" "), erros: v.erros }, { status: 400 });
  const { itens, ...dados } = v.valor;

  const criada = await prisma.creditTransfer.create({
    data: {
      ...dados,
      criadoPorUserId: session.user.id,
      items: { create: itens },
    },
    select: { id: true },
  });
  const [t] = await carregarTransferencias({ id: criada.id });
  return NextResponse.json(t, { status: 201 });
}
