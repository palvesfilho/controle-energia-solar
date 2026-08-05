import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { importarFaturaPdf } from "@/lib/fatura-upload";

export const runtime = "nodejs";

interface UploadResultItem {
  file: string;
  success: boolean;
  error: string | null;
  warning: string | null;
  codigoInstalacao: string | null;
  ucNome: string | null;
  mesRef: number | null;
  anoRef: number | null;
  valorTotal: number | null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  const results: UploadResultItem[] = [];

  for (const f of files) {
    if (!(f instanceof File)) continue;
    const item: UploadResultItem = {
      file: f.name,
      success: false,
      error: null,
      warning: null,
      codigoInstalacao: null,
      ucNome: null,
      mesRef: null,
      anoRef: null,
      valorTotal: null,
    };

    try {
      const importada = await importarFaturaPdf(await f.arrayBuffer());
      item.codigoInstalacao = importada.codigoInstalacao;
      item.ucNome = importada.ucNome;
      item.mesRef = importada.mesReferencia;
      item.anoRef = importada.anoReferencia;
      item.valorTotal = importada.valorTotal;
      // Avisos: UC pendente de cadastro + conferencias do parser que nao
      // fecharam (troca de medidor, soma que nao bate). Sinalizar pro
      // operador em vez de silenciar.
      item.warning = importada.avisos.length ? importada.avisos.join(" · ") : null;
      item.success = true;
    } catch (err) {
      item.error = shortenError(err);
      console.error(`[upload-manual] erro ao processar ${f.name}:`, err);
    }

    results.push(item);
  }

  const okCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    total: results.length,
    ok: okCount,
    falha: results.length - okCount,
    items: results,
  });
}

function shortenError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Mensagens do Prisma incluem o payload inteiro da query; extrai so a linha util.
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const marker = lines.find(
    (l) =>
      l.startsWith("Argument ") ||
      l.startsWith("Unknown arg") ||
      l.startsWith("Unknown field") ||
      l.startsWith("Invalid value") ||
      l.includes("Unique constraint") ||
      l.includes("Foreign key constraint"),
  );
  if (marker) return marker.slice(0, 240);
  const first = lines[0] ?? raw;
  return first.length > 240 ? first.slice(0, 240) + "…" : first;
}
