import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection, isAdminRole } from "@/lib/roles";
import { readFromStorage } from "@/lib/file-storage";

/**
 * Serve arquivos do storage atual (disco ou R2), exigindo autenticação.
 * Acesso: ADMIN, GESTOR, FINANCEIRO — mais quem tem a seção Obra para os
 * arquivos do módulo (lista de materiais, comprovante de retirada e fotos dos
 * materiais separados). Sem isso o gestor de obras subiria a foto e receberia
 * 401 ao tentar vê-la de volta.
 */

const PREFIXOS_OBRA = ["lista-materiais/", "lista-materiais-fotos/"];
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const key = path.join("/");

  const ehArquivoDeObra = PREFIXOS_OBRA.some((p) => key.startsWith(p));
  const autorizado = ehArquivoDeObra
    ? canAccessSection(session.user.role, "obra")
    : isAdminRole(session.user.role);
  if (!autorizado) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = await readFromStorage(key);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  const contentType = mimeMap[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "private, no-cache",
    },
  });
}
