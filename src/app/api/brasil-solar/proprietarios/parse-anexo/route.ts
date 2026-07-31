import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { parseAnexoF } from "@/lib/anexo-f-parser";
import { modeloDaConcessionaria, parseModeloAnexo } from "@/lib/anexo-modelos";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/brasil-solar/proprietarios/parse-anexo
// Recebe um PDF (multipart/form-data, campo "file"), extrai os dados
// do Anexo F (CPFL/RGE) e devolve os campos estruturados para
// prÃ©-preenchimento do cadastro de ProprietÃ¡rio + Planta.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "NÃ£o autorizado" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o PDF no campo 'file'" }, { status: 400 });
  }
  if (file.type && !file.type.includes("pdf")) {
    return NextResponse.json({ error: "Apenas arquivos PDF sÃ£o aceitos" }, { status: 400 });
  }

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 10MB" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Qual leitor usar. O operador informa a concessionária no formulário e ela
  // manda; "modelo" permite forçar direto. Nenhum dos dois → detecção automática.
  const modelo =
    parseModeloAnexo(form.get("modelo")?.toString()) ??
    modeloDaConcessionaria(form.get("concessionaria")?.toString());

  try {
    const parsed = await parseAnexoF(bytes, modelo);
    const { rawText: _rawText, ...clean } = parsed;
    void _rawText;
    return NextResponse.json({ data: clean });
  } catch (err) {
    console.error("[parse-anexo] erro ao processar PDF:", err);
    return NextResponse.json(
      { error: "NÃ£o foi possÃ­vel ler o PDF. Verifique se Ã© um Anexo F vÃ¡lido." },
      { status: 422 },
    );
  }
}
