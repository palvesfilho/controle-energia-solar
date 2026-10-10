import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { montarPacoteRge } from "@/lib/rateio-pacote-rge";

/**
 * POST /api/plants/[id]/rateios/documentos-rge — o pacote de documentos que a
 * RGE pede ao registrar o rateio (ver [[rateio-pacote-rge]]).
 *
 * Recebe a LISTA de UCs, e não o id de um rateio, de propósito: os documentos
 * sobem no portal da RGE antes de ela devolver o protocolo, e sem protocolo o
 * rateio ainda não existe aqui. A mesma rota serve a janela "Novo rateio" (UCs
 * do formulário) e um rateio já gravado (UCs dos itens dele).
 *
 * Body: { consumerUnitIds: string[], baixar?: boolean }
 *   sem `baixar` → JSON com a conferência (o que tem, o que falta, o que a
 *                  procuração cita)
 *   com `baixar` → o ZIP
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const body = (await req.json().catch(() => null)) as {
    consumerUnitIds?: unknown;
    baixar?: boolean;
  } | null;

  const ids = Array.isArray(body?.consumerUnitIds)
    ? [...new Set(body.consumerUnitIds.filter((v): v is string => typeof v === "string" && !!v))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Informe as UCs do rateio." }, { status: 400 });
  }
  if (ids.length > 300) {
    return NextResponse.json({ error: "UCs demais para um rateio só." }, { status: 400 });
  }

  try {
    const pacote = await montarPacoteRge(plantId, ids, { gerarZip: body?.baixar === true });
    if (!pacote) {
      return NextResponse.json({ error: "Usina não encontrada." }, { status: 404 });
    }
    if (!body?.baixar) return NextResponse.json(pacote.conferencia);

    if (!pacote.zip || pacote.conferencia.arquivos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum documento disponível para montar o pacote." },
        { status: 422 },
      );
    }
    return new NextResponse(new Uint8Array(pacote.zip), {
      headers: {
        "Content-Type": "application/zip",
        // Nome de usina tem acento e espaço: o `filename*` é o que os preserva.
        "Content-Disposition": `attachment; filename="documentos-rge.zip"; filename*=UTF-8''${encodeURIComponent(pacote.nomeZip)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[POST /api/plants/[id]/rateios/documentos-rge]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao montar o pacote." },
      { status: 500 },
    );
  }
}
