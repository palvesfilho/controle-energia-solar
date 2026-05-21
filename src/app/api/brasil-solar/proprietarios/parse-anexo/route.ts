import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { parseAnexoF } from "@/lib/anexo-f-parser";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/brasil-solar/proprietarios/parse-anexo
// Recebe um PDF (multipart/form-data, campo "file"), extrai os dados
// do Anexo F (CPFL/RGE) e devolve os campos estruturados para
// pré-preenchimento do cadastro de Proprietário + Planta.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o PDF no campo 'file'" }, { status: 400 });
  }
  if (file.type && !file.type.includes("pdf")) {
    return NextResponse.json({ error: "Apenas arquivos PDF são aceitos" }, { status: 400 });
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 10MB" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const parsed = await parseAnexoF(bytes);
    const { rawText: _rawText, ...clean } = parsed;
    void _rawText;
    return NextResponse.json({ data: clean });
  } catch (err) {
    console.error("[parse-anexo] erro ao processar PDF:", err);
    return NextResponse.json(
      { error: "Não foi possível ler o PDF. Verifique se é um Anexo F válido." },
      { status: 422 },
    );
  }
}
