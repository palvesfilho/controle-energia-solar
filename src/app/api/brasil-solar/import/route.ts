import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  potenciaInstalada?: string | number;
  dataInstalacao?: string;
  modulosMarca?: string;
  modulosModelo?: string;
  modulosQuantidade?: string | number;
  inversorMarca?: string;
  inversorModelo?: string;
  inversorQuantidade?: string | number;
  inversorPotencia?: string | number;
  plataformaMonitoramento?: string;
  monitoramentoLogin?: string;
  monitoramentoSenha?: string;
  monitoramentoUrl?: string;
  monitoramentoPlantId?: string;
  concessionaria?: string;
  codigoUc?: string;
  statusContrato?: string;
  dataContrato?: string;
  consultor?: string;
  garantiaAte?: string;
  geracaoMediaEsperada?: string | number;
  investimento?: string | number;
  observacoesInternas?: string;
  proprietarioId?: string;
}

function parseFloat_(v?: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}

function parseInt_(v?: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v));
  return isNaN(n) ? null : n;
}

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function trim(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s || null;
}

// POST /api/brasil-solar/import - Importacao em lote de clientes
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const rows: ImportRow[] = body.data;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "Dados invalidos. Envie { data: [...] }" },
      { status: 400 }
    );
  }

  // Validar proprietarioIds se fornecidos
  const proprietarioIds = [
    ...new Set(rows.map((r) => r.proprietarioId).filter(Boolean)),
  ] as string[];

  if (proprietarioIds.length > 0) {
    const existing = await prisma.brasilSolarProprietario.findMany({
      where: { id: { in: proprietarioIds }, active: true },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));
    const invalid = proprietarioIds.filter((id) => !existingIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Proprietarios nao encontrados: ${invalid.length} IDs invalidos`,
          invalidIds: invalid,
        },
        { status: 400 }
      );
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const operations = batch.map(async (row, idx) => {
      const rowNum = i + idx + 1;

      if (!row.nome?.trim()) {
        skipped++;
        errorDetails.push(`Linha ${rowNum}: nome vazio`);
        return;
      }

      try {
        const data = {
          nome: row.nome.trim(),
          cpfCnpj: trim(row.cpfCnpj),
          email: trim(row.email),
          telefone: trim(row.telefone),
          endereco: trim(row.endereco),
          cidade: trim(row.cidade),
          uf: trim(row.uf),
          potenciaInstalada: parseFloat_(row.potenciaInstalada),
          dataInstalacao: parseDate(row.dataInstalacao as string),
          modulosMarca: trim(row.modulosMarca),
          modulosModelo: trim(row.modulosModelo),
          modulosQuantidade: parseInt_(row.modulosQuantidade),
          inversorMarca: trim(row.inversorMarca),
          inversorModelo: trim(row.inversorModelo),
          inversorQuantidade: parseInt_(row.inversorQuantidade),
          inversorPotencia: parseFloat_(row.inversorPotencia),
          plataformaMonitoramento: trim(row.plataformaMonitoramento),
          monitoramentoLogin: trim(row.monitoramentoLogin),
          monitoramentoSenha: trim(row.monitoramentoSenha),
          monitoramentoUrl: trim(row.monitoramentoUrl),
          monitoramentoPlantId: trim(row.monitoramentoPlantId),
          concessionaria: trim(row.concessionaria),
          codigoUc: trim(row.codigoUc),
          statusContrato: trim(row.statusContrato) || "ATIVO",
          dataContrato: parseDate(row.dataContrato as string),
          consultor: trim(row.consultor),
          garantiaAte: parseDate(row.garantiaAte as string),
          geracaoMediaEsperada: parseFloat_(row.geracaoMediaEsperada),
          investimento: parseFloat_(row.investimento),
          observacoesInternas: trim(row.observacoesInternas),
          proprietarioId: trim(row.proprietarioId),
        };

        // Se tem cpfCnpj, tentar atualizar existente
        if (data.cpfCnpj) {
          const existing = await prisma.brasilSolarClient.findFirst({
            where: { cpfCnpj: data.cpfCnpj, active: true },
          });

          if (existing) {
            await prisma.brasilSolarClient.update({
              where: { id: existing.id },
              data,
            });
            updated++;
            return;
          }
        }

        await prisma.brasilSolarClient.create({ data });
        created++;
      } catch (e) {
        errors++;
        errorDetails.push(
          `Linha ${rowNum}: erro ao salvar "${row.nome}" - ${(e as Error).message}`
        );
      }
    });

    await Promise.all(operations);
  }

  return NextResponse.json({
    message: "Importacao concluida",
    total: rows.length,
    created,
    updated,
    skipped,
    errors,
    errorDetails: errorDetails.slice(0, 30),
  });
}
