import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatCodigoUc, normalizeCodigoUc, whereCodigoUc } from "@/lib/uc-codigo";

// GET /api/brasil-solar/proprietarios/[id]/beneficiarias
// Lista todas as beneficiárias ativas do proprietário.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId: id, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      codigoUc: true,
      codigoUcAntigo: true,
      nome: true,
      percentual: true,
      observacoes: true,
      consumerUnitId: true,
    },
  });

  return NextResponse.json({ beneficiarias });
}

// PUT /api/brasil-solar/proprietarios/[id]/beneficiarias
// Substitui em lote a lista de beneficiárias. Recebe { beneficiarias: [...] }.
// Soma dos percentuais deve ser 100% (tolerância 0.01).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const proprietario = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!proprietario) {
    return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const rawList = Array.isArray(body.beneficiarias) ? body.beneficiarias : null;
  if (!rawList) {
    return NextResponse.json(
      { error: "Body inválido: esperado { beneficiarias: [...] }" },
      { status: 400 }
    );
  }

  // Normaliza entradas
  type Entry = { codigoUc: string; codigoUcAntigo: string | null; nome: string | null; percentual: number; observacoes: string | null };
  const entries: Entry[] = [];
  for (const item of rawList) {
    const codigoUc =
      typeof item?.codigoUc === "string" ? (normalizeCodigoUc(item.codigoUc.trim()) ?? "") : "";
    const codigoUcAntigo =
      typeof item?.codigoUcAntigo === "string" && item.codigoUcAntigo.trim()
        ? (normalizeCodigoUc(item.codigoUcAntigo.trim()) ?? null)
        : null;
    if (!codigoUc) {
      return NextResponse.json(
        { error: "Toda beneficiária precisa de um Código UC" },
        { status: 400 }
      );
    }
    const percentualRaw = item?.percentual;
    const percentual =
      typeof percentualRaw === "number"
        ? percentualRaw
        : parseFloat(String(percentualRaw ?? ""));
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      return NextResponse.json(
        { error: `Percentual inválido para UC ${formatCodigoUc(codigoUc)} (use 0 a 100)` },
        { status: 400 }
      );
    }
    entries.push({
      codigoUc,
      codigoUcAntigo,
      nome:
        typeof item?.nome === "string" && item.nome.trim()
          ? item.nome.trim()
          : null,
      percentual,
      observacoes:
        typeof item?.observacoes === "string" && item.observacoes.trim()
          ? item.observacoes.trim()
          : null,
    });
  }

  // Sem duplicatas de codigoUc
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.codigoUc)) {
      return NextResponse.json(
        { error: `UC duplicada: ${formatCodigoUc(e.codigoUc)}` },
        { status: 400 }
      );
    }
    seen.add(e.codigoUc);
  }

  // Soma = 100% (tolerância 0.01). Lista vazia também é aceita (rateio limpo).
  if (entries.length > 0) {
    const soma = entries.reduce((acc, e) => acc + e.percentual, 0);
    if (Math.abs(soma - 100) > 0.01) {
      return NextResponse.json(
        {
          error: `A soma dos percentuais precisa ser 100% (atual: ${soma.toFixed(2)}%)`,
        },
        { status: 400 }
      );
    }
  }

  // Carrega dados do proprietário pra herdar concessionária e CPF/CNPJ ao
  // criar ConsumerUnits novas, além da UC titular (codigoUc do proprietário)
  // que serve de base para clonar a credencial RGE pras beneficiárias.
  const propFull = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: {
      cpfCnpj: true,
      cidade: true,
      concessionaria: true,
      codigoUc: true,
    },
  });

  // Credencial da UC titular: se existir, será clonada pras beneficiárias
  // (mesmo login/senha funciona pra todas as UCs do mesmo titular RGE).
  let credencialTitular: {
    emailCpfl: string;
    senhaCpfl: string;
    distribuidora: string;
  } | null = null;
  if (propFull?.codigoUc) {
    const titularUc = await prisma.consumerUnit.findFirst({
      // Casa também pelo código antigo — ver `whereCodigoUc`. Sem isso as
      // beneficiárias não herdam a credencial do titular, caladas.
      where: whereCodigoUc(propFull.codigoUc),
      select: { id: true },
    });
    if (titularUc) {
      const cred = await prisma.cpflCredential.findUnique({
        where: { consumerUnitId: titularUc.id },
        select: { emailCpfl: true, senhaCpfl: true, distribuidora: true },
      });
      if (cred) credencialTitular = cred;
    }
  }

  // Substituição em transação: apaga as ativas + recria. Para cada nova
  // beneficiária, find-or-create ConsumerUnit pelo codigoUc e linka via
  // consumerUnitId. Reaproveita UC existente (não duplica).
  const linkPorCodigo = new Map<string, string>();
  await prisma.$transaction(async (tx) => {
    await tx.brasilSolarBeneficiaria.deleteMany({
      where: { proprietarioId: id },
    });

    for (const e of entries) {
      // Casa também pelo código antigo — ver `whereCodigoUc`. Com `findUnique`
      // no código exato, uma UC já migrada pela RGE não era encontrada e o
      // `create` abaixo fazia uma SEGUNDA UC para a mesma unidade física.
      let uc = await tx.consumerUnit.findFirst({
        where: whereCodigoUc(e.codigoUc),
        select: { id: true, codigoUcAntigo: true },
      });
      if (!uc) {
        uc = await tx.consumerUnit.create({
          data: {
            nome: e.nome ?? `UC ${formatCodigoUc(e.codigoUc)}`,
            codigoUc: e.codigoUc,
            codigoUcAntigo: e.codigoUcAntigo,
            cpfCnpj: propFull?.cpfCnpj ?? null,
            distribuidora: propFull?.concessionaria ?? null,
            cidade: propFull?.cidade ?? null,
            origem: "BRASIL_SOLAR_BENEFICIARIA",
          },
          select: { id: true, codigoUcAntigo: true },
        });
      } else if (e.codigoUcAntigo && uc.codigoUcAntigo !== e.codigoUcAntigo) {
        // Propaga o código antigo informado na beneficiária pra UC física —
        // é ela que casa as faturas (por codigoUc OU codigoUcAntigo).
        await tx.consumerUnit.update({
          where: { id: uc.id },
          data: { codigoUcAntigo: e.codigoUcAntigo },
        });
      }
      linkPorCodigo.set(e.codigoUc, uc.id);
    }

    if (entries.length > 0) {
      await tx.brasilSolarBeneficiaria.createMany({
        data: entries.map((e) => ({
          proprietarioId: id,
          codigoUc: e.codigoUc,
          codigoUcAntigo: e.codigoUcAntigo,
          nome: e.nome,
          percentual: e.percentual,
          observacoes: e.observacoes,
          consumerUnitId: linkPorCodigo.get(e.codigoUc) ?? null,
        })),
      });
    }
  });

  // Clona a credencial da titular pras beneficiárias que ainda não têm uma.
  // Senha já vem criptografada — só replicamos. Statussync PENDING permite
  // que o sync agendado descubra e baixe.
  if (credencialTitular) {
    for (const [, ucId] of linkPorCodigo) {
      try {
        const existing = await prisma.cpflCredential.findUnique({
          where: { consumerUnitId: ucId },
          select: { id: true },
        });
        if (!existing) {
          await prisma.cpflCredential.create({
            data: {
              consumerUnitId: ucId,
              emailCpfl: credencialTitular.emailCpfl,
              senhaCpfl: credencialTitular.senhaCpfl,
              instalacao:
                [...linkPorCodigo.entries()].find(([, v]) => v === ucId)?.[0] ??
                "",
              distribuidora: credencialTitular.distribuidora,
              statusSync: "PENDING",
            },
          });
        }
      } catch (err) {
        console.error(
          "[PUT beneficiarias] clone credencial falhou pra UC",
          ucId,
          err,
        );
      }
    }
  }

  const beneficiarias = await prisma.brasilSolarBeneficiaria.findMany({
    where: { proprietarioId: id, active: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      codigoUc: true,
      codigoUcAntigo: true,
      nome: true,
      percentual: true,
      observacoes: true,
      consumerUnitId: true,
    },
  });

  return NextResponse.json({ beneficiarias });
}
