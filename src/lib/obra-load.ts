import { prisma } from "@/lib/prisma";
import { parseObraMeta } from "@/lib/obra-meta";

export interface LoadedObra {
  obra: NonNullable<Awaited<ReturnType<typeof prisma.obra.findUnique>>>;
  proprietario: Awaited<
    ReturnType<typeof prisma.brasilSolarProprietario.findUnique>
  > | null;
  cleanObservacoes: string;
  meta: ReturnType<typeof parseObraMeta>["meta"];
}

export async function loadObraCompleta(
  obraId: string
): Promise<LoadedObra | null> {
  const obra = await prisma.obra.findUnique({ where: { id: obraId } });
  if (!obra) return null;

  const { meta, rest } = parseObraMeta(obra.observacoes);

  const proprietario = meta.proprietarioId
    ? await prisma.brasilSolarProprietario.findUnique({
        where: { id: meta.proprietarioId },
      })
    : null;

  return { obra, proprietario, cleanObservacoes: rest, meta };
}

// Gera um número de OS estável baseado no id + data de criação.
export function formatNumeroOs(obraId: string, createdAt: Date): string {
  const yy = String(createdAt.getFullYear()).slice(-2);
  const suffix = obraId.slice(-6).toUpperCase();
  return `OS-${yy}-${suffix}`;
}
