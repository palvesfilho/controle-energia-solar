import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { canAccessSection } from "@/lib/roles";
import { corrigirMojibake, listarDocumentosAdesao } from "@/lib/crm-supabase";

/**
 * UCs assinadas no CRM que ainda precisam de cadastro aqui.
 *
 * É o nível em que o operador trabalha: a UC é o que se interliga com a usina.
 * Cada linha traz o kWh assinado daquela UC, os dados do consumidor como
 * constam no termo, e os documentos do cliente.
 *
 * ?situacao=PENDENTE|CONCLUIDA|IGNORADA  (padrão: PENDENTE)
 *
 * Os documentos são lidos do CRM ao vivo e não copiados: a lista muda lá
 * (cliente manda o contrato social depois) e a gente não quer cópia velha.
 * Se o CRM estiver fora do ar, as UCs ainda aparecem — só sem os anexos.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role, "crmIntegracao")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const situacao = (req.nextUrl.searchParams.get("situacao") ?? "PENDENTE").toUpperCase();

  try {
    // MESMA ORDEM DO CRM, de propósito: lá a lista de adesões é ordenada por
    // `criado_em` descendente (backend/src/routes/adesoes.js), e dentro de cada
    // adesão as UCs saem na ordem do termo. Assim dá para conferir as duas
    // telas lado a lado, linha a linha, em vez de caçar por nome.
    //
    // `nulls: "last"` porque linha lida antes desta coluna existir tem
    // `adesaoCriadaEm` nulo — e em DESC o Postgres jogaria os nulos para o topo,
    // pondo justamente as mais antigas na frente. O próximo sync preenche.
    const ucs = await prisma.crmUcImportada.findMany({
      where: { situacao },
      orderBy: [
        { adesaoCriadaEm: { sort: "desc", nulls: "last" } },
        { adesaoIdCrm: "desc" },
        { ordemNaAdesao: "asc" },
      ],
    });

    // A UC já cadastrada aqui é marcada na tela, para o operador não cadastrar
    // de novo. Casa pelo código exato -- ver [[whereCodigoUc]] para o porquê de
    // não inventar variações.
    const codigos = [...new Set(ucs.map((u) => u.codigoUc))];
    const jaCadastradas = codigos.length
      ? await prisma.consumerUnit.findMany({
          where: { codigoUc: { in: codigos } },
          select: { id: true, codigoUc: true, nome: true },
        })
      : [];
    const cadastradaPorCodigo = new Map(jaCadastradas.map((c) => [c.codigoUc, c]));

    let docsPorAdesao = new Map<number, unknown[]>();
    let avisoDocumentos: string | null = null;
    try {
      const docs = await listarDocumentosAdesao();
      docsPorAdesao = docs.reduce((mapa, d) => {
        if (d.adesao_id == null) return mapa;
        const lista = mapa.get(d.adesao_id) ?? [];
        lista.push({
          id: d.id,
          categoria: d.categoria,
          nomeArquivo: corrigirMojibake(d.nome_arquivo),
          tamanho: d.tamanho,
          mime: d.mime,
        });
        mapa.set(d.adesao_id, lista);
        return mapa;
      }, new Map<number, unknown[]>());
    } catch (err) {
      avisoDocumentos =
        err instanceof Error ? err.message : "CRM indisponível para listar documentos.";
      console.error("[GET /api/crm/ucs] documentos:", err);
    }

    return NextResponse.json({
      avisoDocumentos,
      ucs: ucs.map((u) => ({
        ...u,
        documentos: docsPorAdesao.get(u.adesaoIdCrm) ?? [],
        jaCadastrada: cadastradaPorCodigo.get(u.codigoUc) ?? null,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/crm/ucs] erro:", err);
    return NextResponse.json(
      {
        error: msg,
        hint: "Se mencionar 'crmUcImportada', a migration 20260815050000_crm_uc_importada ainda não foi aplicada.",
      },
      { status: 500 },
    );
  }
}
