/**
 * GET /api/consumer-units/[id]/bills/backfill/status?jobId=xxx
 *
 * Acompanha um backfill e, quando ele termina, IMPORTA as faturas baixadas.
 *
 * Por que importar aqui e não numa rota à parte: o robô guarda os PDFs no
 * armazenamento dele e não conhece o Gestor. Alguém precisa buscá-los e criar os
 * ConsumerBills — e o momento certo é assim que o job conclui, que é justamente o
 * que esta rota descobre. A tela já faz polling; não precisa de um passo a mais.
 *
 * Chamar duas vezes não duplica nada: `ingerirFaturaPdf` é idempotente por
 * (UC, competência) — a segunda passada devolve "ja_existia" e não sobrescreve.
 *
 * ⚠️ Use `completo`, não `status === "concluido"`, para dizer se deu certo: o robô
 * segue em frente quando o portal falha numa UC. `ucsIncompletas` diz o que faltou.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import {
  baixarPdfDaFatura,
  consultarJob,
  RoboIndisponivelError,
  type FaturaDoRobo,
} from "@/lib/robo-faturas";
import {
  contarPorStatus,
  ingerirFaturaPdf,
  type IngestItem,
} from "@/lib/fatura-ingest";

export const runtime = "nodejs";

/** Estados em que o robô já não vai mexer mais no job. */
const TERMINAIS = ["concluido", "falhou", "cancelado"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // a UC vem na URL por clareza; o jobId é que identifica o trabalho
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Informe ?jobId=" }, { status: 400 });
  }

  let job;
  try {
    job = await consultarJob(jobId);
  } catch (err) {
    if (err instanceof RoboIndisponivelError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const emAndamento = !TERMINAIS.includes(job.status);
  if (emAndamento) {
    // Ainda rodando: devolve só o sinal de vida. Demora NÃO é erro — a fila de
    // acesso da CPFL sozinha pode levar 45 min.
    return NextResponse.json({
      jobId,
      status: job.status,
      progresso: job.progresso,
      terminou: false,
    });
  }

  // Terminou: traz para dentro o que o robô conseguiu baixar. Faturas em aberto
  // ou indisponíveis não são erro — o portal simplesmente não gera segunda via
  // delas; entram no resumo como "sem PDF", não como falha.
  const baixadas = job.faturas.filter(
    (f: FaturaDoRobo) => f.status === "baixada" && (f.chave || f.arquivo),
  );

  const importadas: IngestItem[] = [];
  for (const fatura of baixadas) {
    try {
      const pdf = await baixarPdfDaFatura(fatura);
      importadas.push(await ingerirFaturaPdf(`${fatura.uc}-${fatura.mes}.pdf`, pdf));
    } catch (err) {
      importadas.push({
        file: `${fatura.uc}-${fatura.mes}.pdf`,
        status: "erro",
        error:
          err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240),
        codigoInstalacao: null,
        ucNome: null,
        mesRef: null,
        anoRef: null,
      });
    }
  }

  const semPdf = job.faturas.filter((f: FaturaDoRobo) =>
    ["em_aberto", "indisponivel"].includes(f.status),
  );
  const falharam = job.faturas.filter((f: FaturaDoRobo) =>
    ["falha", "falha_envio"].includes(f.status),
  );

  return NextResponse.json({
    jobId,
    status: job.status,
    terminou: true,
    // Do robô: baixou tudo que se pediu?
    completo: job.completo,
    erro: job.erro,
    ucsIncompletas: job.ucsIncompletas,
    encontradas: job.faturas.length,
    semSegundaVia: semPdf.length,
    falhasNoDownload: falharam.length,
    // Da importação: o que virou fatura no Gestor.
    ...contarPorStatus(importadas),
    items: importadas,
  });
}
