import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const ano = Number(searchParams.get("ano") ?? now.getFullYear());
  const mes = Number(searchParams.get("mes") ?? now.getMonth() + 1);

  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "ano/mes inválidos" }, { status: 400 });
  }

  const units = await prisma.consumerUnit.findMany({
    include: {
      consumer: { select: { id: true, name: true } },
      bills: {
        where: { anoReferencia: ano, mesReferencia: mes },
        select: {
          consumoKwh: true,
          energiaCompensada: true,
          saldoCreditos: true,
        },
        take: 1,
      },
      billings: {
        where: { ano, mes },
        select: {
          valorCobranca: true,
          valorEconomia: true,
        },
        take: 1,
      },
    },
    orderBy: { nome: "asc" },
  });

  const rows = units.map((u) => {
    const bill = u.bills[0] ?? null;
    const billing = u.billings[0] ?? null;
    return {
      id: u.id,
      codigoUc: u.codigoUc,
      nome: u.nome,
      consumerName: u.consumer?.name ?? null,
      consumoKwh: bill?.consumoKwh ?? null,
      energiaCompensada: bill?.energiaCompensada ?? null,
      saldoCreditos: bill?.saldoCreditos ?? null,
      valorCobranca: billing?.valorCobranca ?? null,
      valorEconomia: billing?.valorEconomia ?? null,
    };
  });

  return NextResponse.json({ ano, mes, rows });
}
