import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { enviarConviteCadastroCliente } from "@/lib/clerk-invite";

// POST /api/brasil-solar/proprietarios/[id]/convite/enviar-cadastro
// Ação MANUAL: dispara o e-mail de convite Clerk (login/senha) ao cliente.
// Só permitido quando o acesso está ATIVO (pagamento confirmado).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id },
    select: { id: true, email: true, clerkUserId: true, acesso: true },
  });
  if (!prop) {
    return NextResponse.json({ error: "Proprietário não encontrado." }, { status: 404 });
  }
  if (!prop.email) {
    return NextResponse.json(
      { error: "Proprietário sem e-mail cadastrado — obrigatório para o convite." },
      { status: 400 },
    );
  }
  if (prop.clerkUserId) {
    return NextResponse.json(
      { error: "Este cliente já tem cadastro concluído." },
      { status: 409 },
    );
  }
  if (prop.acesso?.status !== "ATIVO") {
    return NextResponse.json(
      { error: "Envie o cadastro apenas após o pagamento ser confirmado (acesso ATIVO)." },
      { status: 409 },
    );
  }

  try {
    const r = await enviarConviteCadastroCliente({
      email: prop.email,
      proprietarioId: prop.id,
    });
    await prisma.brasilSolarAcesso.update({
      where: { proprietarioId: id },
      data: { conviteEnviadoEm: new Date() },
    });
    return NextResponse.json({ ok: true, email: r.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao enviar convite.";
    console.error("[enviar-cadastro] erro:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
