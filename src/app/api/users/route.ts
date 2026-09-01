import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { podeEmitirAcesso, rolesAtribuiveisPor } from "@/lib/roles";
import { hashSync } from "bcryptjs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !podeEmitirAcesso(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (role) where.role = role;
  if (active !== null && active !== undefined && active !== "") {
    where.active = active === "true";
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      clerkId: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // O `clerkId` em si não vai pra tela — a tela só precisa saber se o acesso já
  // foi emitido, e expor o id da identidade não serve a nada aqui.
  return NextResponse.json(
    users.map(({ clerkId, ...u }) => ({ ...u, acessoEmitido: clerkId !== null })),
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !podeEmitirAcesso(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role } = body;

  // `password` deixou de ser obrigatório em 31/08/2026: o login por senha local
  // morreu em 08/08 (a rota devolve 410) e quem autentica é o Clerk. Exigir
  // senha aqui só produzia um hash que ninguém lê — e escondia o fato de que
  // criar a linha NÃO dá acesso: falta o convite.
  if (!name || !email || !role) {
    return NextResponse.json(
      { error: "Campos obrigatórios: nome, email e perfil" },
      { status: 400 }
    );
  }

  // Cada operador só atribui o que pode: ADMIN atribui tudo; FINANCEIRO e
  // POS_VENDA não criam conta privilegiada — senão emitir acesso viraria um
  // caminho para se promover.
  if (!rolesAtribuiveisPor(session.user.role).includes(role)) {
    return NextResponse.json(
      { error: "Perfil inválido ou acima da sua alçada" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "Email já cadastrado" },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: password ? hashSync(password, 10) : "",
      role,
      ...(role === "INVESTOR"
        ? {
            investor: {
              create: {
                phone: body.phone || null,
                document: body.document || null,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
