import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

const OBS_PROVISORIO =
  "Cadastro provisório criado pela adesão (guia de pós-venda). " +
  "Completar dados e clicar em 'Enviar convite' para gerar a cobrança.";

// POST /api/brasil-solar/adesao
// Cria um proprietário + usina PROVISÓRIOS em Clientes Brasil Solar a partir do
// formulário de adesão (nome, CPF/CNPJ, endereço, telefone, e-mail).
// NÃO gera cobrança: devolve o link da página do proprietário no admin, onde o
// time de pós-venda define o plano/valor e dispara o convite pela tela existente.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const nome = str(body.nomeCompleto);
  const cpfCnpj = str(body.cpfCnpj);
  const endereco = str(body.endereco);
  const telefone = str(body.telefone);
  const email = str(body.email);

  if (!nome) {
    return NextResponse.json(
      { error: "Informe o nome completo do cliente." },
      { status: 400 }
    );
  }
  if (!cpfCnpj) {
    return NextResponse.json(
      { error: "Informe o CPF/CNPJ do cliente." },
      { status: 400 }
    );
  }
  if (!endereco) {
    return NextResponse.json(
      { error: "Informe o endereço do cliente." },
      { status: 400 }
    );
  }
  if (!telefone) {
    return NextResponse.json(
      { error: "Informe o telefone do cliente." },
      { status: 400 }
    );
  }
  if (!email) {
    return NextResponse.json(
      { error: "Informe o e-mail do cliente." },
      { status: 400 }
    );
  }

  // executadoPor=TERCEIRO: só monitoramento, pula toda a validação/criação
  // automática de obra e tarefas — adequado a um cadastro provisório.
  const proprietario = await prisma.brasilSolarProprietario.create({
    data: {
      nome,
      cpfCnpj,
      email,
      telefone,
      endereco,
      observacoes: OBS_PROVISORIO,
      executadoPor: "TERCEIRO",
    },
  });

  // Usina provisória vinculada ao proprietário. Só o nome é obrigatório; o
  // restante o time completa depois. Não falha a adesão se a usina não criar.
  try {
    await prisma.brasilSolarClient.create({
      data: {
        nome: `Usina de ${nome} (provisória)`,
        endereco,
        proprietarioId: proprietario.id,
      },
    });
  } catch (e) {
    console.error("[adesao] falha ao criar usina provisória:", e);
  }

  return NextResponse.json(
    {
      proprietarioId: proprietario.id,
      redirectUrl: `/admin/brasil-solar/proprietarios/${proprietario.id}`,
    },
    { status: 201 }
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
