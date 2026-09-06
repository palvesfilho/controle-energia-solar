/**
 * Comunicado novo — o editor em branco.
 *
 * Nasce mirando os CLIENTES COM DESCONTO porque é o público maior (75 contra
 * 19) e o de contato mais completo. Trocar é um clique.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { modoComunicado } from "@/lib/comunicados-envio";
import ComunicadoEditor from "@/components/comunicados/comunicado-editor";

export const dynamic = "force-dynamic";

export default async function NovoComunicadoPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessSection(session.user.role ?? "", "comunicados")) notFound();

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
          <h1 className="text-2xl font-bold">Novo comunicado</h1>
          <p className="text-sm text-muted-foreground">
            Escolha o público, escreva a mensagem e confira a prévia antes de disparar.
          </p>
        </div>
      </div>

      <ComunicadoEditor
        modo={modoComunicado()}
        inicial={{
          nome: "",
          tipo: "INFORMATIVO",
          desenho: "PADRAO",
          destaqueRotulo: "",
          destaqueValor: "",
          destaqueNota: "",
          botaoTexto: "",
          botaoUrl: "",
          botaoNota: "",
          publico: "CLIENTE_DESCONTO",
          publicoFiltro: {},
          canais: ["EMAIL"],
          assunto: "",
          corpoEmail: "{{saudacao}},\n\n",
          corpoWhatsapp: "{{saudacao}}!\n\n",
          status: "RASCUNHO",
        }}
      />
    </div>
  );
}
