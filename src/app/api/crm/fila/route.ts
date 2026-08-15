import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { pertenceAoModulo, type ModuloCrm } from "@/lib/crm-modulo";

/**
 * Fila de vendas ganhas vindas do CRM que ainda precisam de cadastro aqui
 * (UC, usina, plano de monitoramento) e as caixas de exceção.
 *
 * ?situacao=PENDENTE|ASSINADA_SEM_VENDA|NAO_CLASSIFICADO|CONCLUIDA|IGNORADA
 * Sem o parâmetro, devolve tudo que exige atenção humana.
 *
 * ?modulo=assoc|bs  restringe ao módulo do AURA. Ver [[crm-modulo]]: a
 * Associação vê só as adesões de desconto na fatura; a Brasil Solar vê obra e
 * monitoramento. Sem o parâmetro devolve tudo — é o que os scripts e
 * diagnósticos esperam.
 */
const EXIGEM_ATENCAO = ["PENDENTE", "ASSINADA_SEM_VENDA", "NAO_CLASSIFICADO"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const situacao = req.nextUrl.searchParams.get("situacao");
  const moduloBruto = req.nextUrl.searchParams.get("modulo");
  if (moduloBruto && moduloBruto !== "assoc" && moduloBruto !== "bs") {
    return NextResponse.json(
      { error: `modulo inválido: ${moduloBruto}`, hint: "Use assoc ou bs." },
      { status: 400 },
    );
  }
  const modulo = moduloBruto as ModuloCrm | null;

  try {
    const linhas = await prisma.crmVendaImportada.findMany({
      where: situacao
        ? { situacao: situacao.toUpperCase() }
        : { situacao: { in: EXIGEM_ATENCAO } },
      orderBy: [{ situacao: "asc" }, { fechadoEm: "desc" }],
    });

    if (!modulo) return NextResponse.json(linhas);

    // O de-para é a fonte do módulo, e o operador pode editá-lo na tela de
    // Produtos a qualquer momento. Por isso o cruzamento é feito na LEITURA,
    // e não gravado em coluna no sync: mudou o destino do produto, a linha
    // muda de módulo na hora, sem re-sincronizar.
    const dePara = await prisma.crmProdutoDestino.findMany({
      select: { codigoProduto: true, geraObra: true, destinoGestao: true, ativo: true },
    });
    const porCodigo = new Map(dePara.map((d) => [d.codigoProduto, d]));

    return NextResponse.json(
      linhas.filter((l) => pertenceAoModulo(porCodigo.get(l.codigoProduto), modulo)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/fila] erro:", err);
    return NextResponse.json(
      {
        error: msg,
        hint: "Se mencionar 'crmVendaImportada' ou 'Unknown arg', rode `npx prisma generate` com o dev server parado.",
      },
      { status: 500 },
    );
  }
}
