/**
 * POST /api/faturas-energia/ingest
 *
 * Ingestão server-to-server de faturas de energia baixadas por um robô de download
 * (backfill de meses ANTERIORES — o mês vigente continua vindo do Infosimples).
 *
 * A regra de negócio (parsear o PDF, resolver a UC, criar o ConsumerBill sem
 * duplicar) mora em `@/lib/fatura-ingest` — esta rota é só a porta HTTP. O botão
 * "Sincronizar faturas antigas" usa a MESMA função, sem passar por aqui: ele baixa
 * os PDFs do serviço de robôs e ingere direto (ver bills/backfill/status).
 *
 * Esta rota continua valendo para um robô que prefira EMPURRAR os PDFs em vez de
 * ser consultado. Hoje ninguém a chama.
 *
 * Autenticação: header `Authorization: Bearer <CRON_SECRET>` (ou `?token=`).
 * Entrada: multipart/form-data com um ou mais campos `files` (PDFs).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  contarPorStatus,
  ingerirFaturaPdf,
  type IngestItem,
} from "@/lib/fatura-ingest";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado: bloqueia explicitamente
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized — envie Authorization: Bearer <CRON_SECRET>" },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Envie multipart/form-data com o campo 'files' (PDFs)." },
      { status: 400 },
    );
  }

  const files = formData.getAll("files");
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Nenhum arquivo enviado (campo 'files')." },
      { status: 400 },
    );
  }

  const results: IngestItem[] = [];
  for (const f of files) {
    if (!(f instanceof File)) continue;
    results.push(await ingerirFaturaPdf(f.name, await f.arrayBuffer()));
  }

  return NextResponse.json({ ...contarPorStatus(results), items: results });
}
