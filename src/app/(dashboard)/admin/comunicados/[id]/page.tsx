/**
 * Um comunicado: o editor enquanto é rascunho, o RELATÓRIO depois de disparado.
 *
 * 🔑 A mesma rota serve os dois estados de propósito. Depois do disparo o que
 * importa não é mais o texto e sim para onde ele foi, e essa lista é a única
 * prova de quem recebeu o quê — por isso ela mostra os erros também, não só os
 * sucessos.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { modoComunicado } from "@/lib/comunicados-envio";
import ComunicadoEditor, { type Filtro } from "@/components/comunicados/comunicado-editor";

export const dynamic = "force-dynamic";

export default async function ComunicadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role ?? "", "comunicados")) notFound();

  const { id } = await params;
  const c = await prisma.comunicado.findUnique({
    where: { id },
    include: { envios: { orderBy: { destinatarioNome: "asc" } } },
  });
  if (!c) notFound();

  const rascunho = c.status === "RASCUNHO";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/comunicados"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{c.nome || "Comunicado"}</h1>
          <p className="text-sm text-muted-foreground">
            {rascunho
              ? "Rascunho — ainda não saiu para ninguém."
              : `${c.simulacao ? "Ensaio" : "Enviado"} em ${c.enviadoEm?.toLocaleString("pt-BR") ?? "—"} · ${c.publicoResumo ?? ""}`}
          </p>
        </div>
      </div>

      <ComunicadoEditor
        modo={modoComunicado()}
        inicial={{
          id: c.id,
          nome: c.nome,
          publico: c.publico as "INVESTIDOR" | "CLIENTE_DESCONTO",
          publicoFiltro: (c.publicoFiltro ?? {}) as Filtro,
          canais: c.canais.split(",").filter(Boolean),
          assunto: c.assunto,
          corpoEmail: c.corpoEmail,
          corpoWhatsapp: c.corpoWhatsapp,
          status: c.status,
        }}
      />

      {!rascunho && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Para onde foi</h2>
              <p className="text-xs text-muted-foreground">
                {c.envios.length} destinatário(s). Esta lista é a prova do que saiu — inclusive
                do que falhou.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Quem</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {c.envios.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">{e.destinatarioNome}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.email ?? "—"} {e.telefone ? `· ${e.telefone}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Situacao status={e.emailStatus} erro={e.emailErro} />
                      </td>
                      <td className="px-4 py-2">
                        <Situacao status={e.whatsappStatus} erro={e.whatsappErro} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Situacao({ status, erro }: { status: string; erro: string | null }) {
  const cor =
    status === "ENVIADO"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "FALHA"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const rotulo: Record<string, string> = {
    ENVIADO: "Enviado",
    FALHA: "Falhou",
    SEM_DESTINO: "Sem contato",
    SIMULADO: "Ensaio",
    NAO_APLICA: "—",
    PENDENTE: "Pendente",
  };
  return (
    <div>
      <span className={cor}>{rotulo[status] ?? status}</span>
      {erro && <div className="text-xs text-muted-foreground">{erro}</div>}
    </div>
  );
}
