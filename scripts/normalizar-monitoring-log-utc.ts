import { prisma } from "../src/lib/prisma";

/**
 * Normaliza monitoring_logs.data para meio-dia UTC.
 *
 * Contexto: até 01/05/2026 os syncs gravavam a data em hora LOCAL (BRT),
 * resultando em 15:00Z. A partir de 22/05/2026 passaram a gravar 12:00Z.
 * O unique é (client_id, data) — então um dia que já tinha 15:00Z ganha uma
 * SEGUNDA linha quando o sync novo roda, e o relatório soma as duas
 * (geração dobrada). Ver [[feedback_monitoring_log_date_utc]].
 *
 * O que faz:
 *   1. Apaga as linhas fora de 12:00Z que JÁ têm par em 12:00Z no mesmo dia
 *      (a de 12:00Z é a mais recente e é a que os syncs vão continuar
 *      atualizando).
 *   2. Move as linhas restantes fora de 12:00Z para 12:00Z do mesmo dia.
 *
 * Uso:
 *   npx cross-env NODE_OPTIONS=--use-system-ca tsx scripts/normalizar-monitoring-log-utc.ts          (dry-run)
 *   npx cross-env NODE_OPTIONS=--use-system-ca tsx scripts/normalizar-monitoring-log-utc.ts --apply  (executa)
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  const tipo = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'monitoring_logs' AND column_name = 'data'`,
  );
  console.log(`Tipo da coluna monitoring_logs.data: ${tipo[0]?.data_type ?? "?"}`);
  if (tipo[0]?.data_type !== "timestamp without time zone") {
    console.log(
      `AVISO: coluna nao e 'timestamp without time zone' — date_trunc pode depender do TZ da sessao. Revise antes de aplicar.`,
    );
  }

  const [antes] = await prisma.$queryRawUnsafe<{ fora: bigint; colidem: bigint; movem: bigint }[]>(
    `SELECT
       (SELECT COUNT(*) FROM monitoring_logs WHERE data <> date_trunc('day', data) + interval '12 hours')::bigint AS fora,
       (SELECT COUNT(*) FROM monitoring_logs a
        WHERE a.data <> date_trunc('day', a.data) + interval '12 hours'
          AND EXISTS (SELECT 1 FROM monitoring_logs b
                      WHERE b.client_id = a.client_id
                        AND b.data = date_trunc('day', a.data) + interval '12 hours'))::bigint AS colidem,
       (SELECT COUNT(*) FROM monitoring_logs a
        WHERE a.data <> date_trunc('day', a.data) + interval '12 hours'
          AND NOT EXISTS (SELECT 1 FROM monitoring_logs b
                          WHERE b.client_id = a.client_id
                            AND b.data = date_trunc('day', a.data) + interval '12 hours'))::bigint AS movem`,
  );
  console.log(`\nLinhas fora de 12:00Z : ${Number(antes.fora)}`);
  console.log(`  a APAGAR (duplicata): ${Number(antes.colidem)}`);
  console.log(`  a MOVER  (sem par)  : ${Number(antes.movem)}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN — nada foi alterado. Rode com --apply para executar.`);
    return;
  }

  const apagadas = await prisma.$executeRawUnsafe(
    `DELETE FROM monitoring_logs a
     WHERE a.data <> date_trunc('day', a.data) + interval '12 hours'
       AND EXISTS (SELECT 1 FROM monitoring_logs b
                   WHERE b.client_id = a.client_id
                     AND b.data = date_trunc('day', a.data) + interval '12 hours')`,
  );
  console.log(`\nApagadas: ${apagadas}`);

  const movidas = await prisma.$executeRawUnsafe(
    `UPDATE monitoring_logs
     SET data = date_trunc('day', data) + interval '12 hours'
     WHERE data <> date_trunc('day', data) + interval '12 hours'`,
  );
  console.log(`Movidas : ${movidas}`);

  const [depois] = await prisma.$queryRawUnsafe<{ fora: bigint; dias_dup: bigint }[]>(
    `SELECT
       (SELECT COUNT(*) FROM monitoring_logs WHERE data <> date_trunc('day', data) + interval '12 hours')::bigint AS fora,
       (SELECT COUNT(*) FROM (SELECT client_id, date_trunc('day', data) d FROM monitoring_logs
                              GROUP BY 1,2 HAVING COUNT(*) > 1) t)::bigint AS dias_dup`,
  );
  console.log(`\nConferencia final — fora de 12:00Z: ${Number(depois.fora)} | dias duplicados: ${Number(depois.dias_dup)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
