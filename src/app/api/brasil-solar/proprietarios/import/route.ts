import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

interface ImportRow {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  observacoes?: string;
}

// POST /api/brasil-solar/proprietarios/import - Importacao em lote
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const rows: ImportRow[] = body.data;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Dados invalidos. Envie { data: [...] }" }, { status: 400 });
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
        // Tentar upsert por cpfCnpj se disponivel
        if (row.cpfCnpj?.trim()) {
          const existing = await prisma.brasilSolarProprietario.findFirst({
            where: { cpfCnpj: row.cpfCnpj.trim(), active: true },
          });

          if (existing) {
            await prisma.brasilSolarProprietario.update({
              where: { id: existing.id },
              data: {
                nome: row.nome.trim(),
                email: row.email?.trim() || existing.email,
                telefone: row.telefone?.trim() || existing.telefone,
                endereco: row.endereco?.trim() || existing.endereco,
                cidade: row.cidade?.trim() || existing.cidade,
                uf: row.uf?.trim() || existing.uf,
                observacoes: row.observacoes?.trim() || existing.observacoes,
              },
            });
            updated++;
            return;
          }
        }

        await prisma.brasilSolarProprietario.create({
          data: {
            nome: row.nome.trim(),
            cpfCnpj: row.cpfCnpj?.trim() || null,
            email: row.email?.trim() || null,
            telefone: row.telefone?.trim() || null,
            endereco: row.endereco?.trim() || null,
            cidade: row.cidade?.trim() || null,
            uf: row.uf?.trim() || null,
            observacoes: row.observacoes?.trim() || null,
          },
        });
        created++;
      } catch {
        errors++;
        errorDetails.push(`Linha ${rowNum}: erro ao salvar "${row.nome}"`);
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
    errorDetails: errorDetails.slice(0, 20),
  });
}
