import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { BloqueioCpflError, buscarUcCpfl } from "@/lib/cpfl-busca-uc";

// De-para novo ⇄ antigo direto no site público da CPFL — o botão "Buscar código"
// do cadastro de UC. Não lê nem grava nada no banco.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const codigo = (new URL(req.url).searchParams.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length < 6 || codigo.length > 12) {
    return NextResponse.json({ error: "Informe o código da UC" }, { status: 400 });
  }

  try {
    return NextResponse.json(await buscarUcCpfl(codigo));
  } catch (erro) {
    const bloqueio = erro instanceof BloqueioCpflError;
    console.error("[buscar-codigo-cpfl]", codigo, erro);
    return NextResponse.json(
      {
        error: bloqueio
          ? "A CPFL está limitando as consultas. Tente de novo em alguns minutos."
          : "Não consegui consultar o site da CPFL. Tente de novo.",
      },
      { status: bloqueio ? 503 : 502 },
    );
  }
}
