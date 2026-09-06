/**
 * Comunicados — a lista do que já foi escrito e do que já saiu.
 *
 * 🪤 Não confundir com Brasil Solar → Mensagens: aquilo é push no celular do
 * proprietário BS. Isto é email e WhatsApp para os dois públicos da Associação.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { modoComunicado } from "@/lib/comunicados-envio";

export const dynamic = "force-dynamic";

const PUBLICO_LABEL: Record<string, string> = {
  CLIENTE_DESCONTO: "Clientes com desconto",
  INVESTIDOR: "Investidores",
};

export default async function ComunicadosPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role ?? "", "comunicados")) notFound();

  const comunicados = await prisma.comunicado.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, nome: true, publico: true, publicoResumo: true, canais: true,
      status: true, simulacao: true, totalDestinatarios: true, enviadoEm: true,
      createdAt: true, criadoPorNome: true,
    },
  });
  const modo = modoComunicado();

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Comunicados</h1>
          <p className="text-sm text-muted-foreground">
            Mensagem em massa por email e WhatsApp para os investidores e para os clientes com
            desconto na fatura.
          </p>
        </div>
        <Link
          href="/admin/comunicados/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Novo comunicado
        </Link>
      </div>

      {modo === "simulacao" && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <strong>Modo ensaio.</strong> Nenhum comunicado sai para cliente nenhum enquanto{" "}
            <code>COMUNICADOS_MODO</code> não valer <code>real</code>.
          </CardContent>
        </Card>
      )}

      {comunicados.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Send className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum comunicado ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">Comunicado</th>
                  <th className="px-4 py-2.5 text-left">Público</th>
                  <th className="px-4 py-2.5 text-left">Canais</th>
                  <th className="px-4 py-2.5 text-right">Pessoas</th>
                  <th className="px-4 py-2.5 text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {comunicados.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/comunicados/${c.id}`} className="font-medium hover:underline">
                        {c.nome}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.publicoResumo ?? PUBLICO_LABEL[c.publico] ?? c.publico}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{PUBLICO_LABEL[c.publico] ?? c.publico}</td>
                    <td className="px-4 py-2.5">{c.canais.replace(",", " + ")}</td>
                    <td className="px-4 py-2.5 text-right">
                      {c.status === "RASCUNHO" ? "—" : c.totalDestinatarios}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.status === "RASCUNHO" ? (
                        <span className="text-muted-foreground">Rascunho</span>
                      ) : c.simulacao ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          Ensaio · {formatar(c.enviadoEm)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Enviado · {formatar(c.enviadoEm)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatar(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR") : "—";
}
