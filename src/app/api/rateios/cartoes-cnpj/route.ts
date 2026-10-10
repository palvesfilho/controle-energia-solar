import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { readFromStorage } from "@/lib/file-storage";
import { emissaoCartaoCnpjDoArquivo } from "@/lib/rateio-pacote-rge";
import { validadeCartaoCnpj } from "@/lib/cartao-cnpj";

/**
 * POST /api/rateios/cartoes-cnpj — a validade do cartão CNPJ de cada UC
 * informada, lida do arquivo guardado no cadastro dela.
 *
 * Serve o aviso da montagem do rateio: a RGE recusa cartão emitido há mais de
 * 6 meses, e isso precisa aparecer quando o operador ESCOLHE as UCs, não só na
 * hora de baixar o ZIP. Rota separada da do rateio vigente porque abre PDF — a
 * tela do rateio não deve esperar por isso para carregar.
 *
 * Body: { consumerUnitIds: string[] }
 * Devolve só as UCs que TÊM cartão CNPJ guardado; a falta do documento já é
 * avisada pelo cadastro (`docsFaltando`).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { consumerUnitIds?: unknown } | null;
  const ids = Array.isArray(body?.consumerUnitIds)
    ? [...new Set(body.consumerUnitIds.filter((v): v is string => typeof v === "string" && !!v))]
    : [];
  if (ids.length === 0) return NextResponse.json([]);
  if (ids.length > 300) {
    return NextResponse.json({ error: "UCs demais para um rateio só." }, { status: 400 });
  }

  // origem-ok: busca por id das UCs que a tela do rateio já escolheu.
  const ucs = await prisma.consumerUnit.findMany({
    where: { id: { in: ids }, docCartaoCnpj: { not: null } },
    select: { id: true, nome: true, cpfCnpj: true, docCartaoCnpj: true },
  });

  // Um titular com várias UCs aponta para o mesmo arquivo: lê uma vez só.
  const emissoes = new Map<string, Promise<string | null>>();
  const emissaoDe = (path: string) => {
    let p = emissoes.get(path);
    if (!p) {
      p = readFromStorage(path)
        .then((r) => (r ? emissaoCartaoCnpjDoArquivo(r.data) : null))
        .catch(() => null);
      emissoes.set(path, p);
    }
    return p;
  };

  return NextResponse.json(
    await Promise.all(
      ucs.map(async (u) => ({
        id: u.id,
        nome: u.nome,
        cpfCnpj: u.cpfCnpj,
        validade: validadeCartaoCnpj(await emissaoDe(u.docCartaoCnpj!)),
      })),
    ),
  );
}
