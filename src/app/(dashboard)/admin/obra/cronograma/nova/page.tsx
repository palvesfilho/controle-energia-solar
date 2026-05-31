import Link from "next/link";
import { ChevronLeft, CalendarRange } from "lucide-react";
import { ObraForm, type ObraFormValues } from "@/components/obras/obra-form";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, proximoDiaUtil } from "@/lib/obra-calendario";

// Sugere início = próximo dia útil após o fim previsto da obra mais
// futura já cadastrada. Ignora canceladas e inativas — o operador
// pode sobrescrever no form.
async function sugerirDataInicio(): Promise<string> {
  const ultima = await prisma.obra.findFirst({
    where: {
      active: true,
      status: { not: "CANCELADA" },
      dataFimPrevista: { not: null },
    },
    orderBy: { dataFimPrevista: "desc" },
    select: { dataFimPrevista: true },
  });
  if (!ultima?.dataFimPrevista) return "";
  return formatDateOnly(proximoDiaUtil(ultima.dataFimPrevista));
}

export default async function NovaObraPage() {
  const dataInicioSugerida = await sugerirDataInicio();
  const initialValues: ObraFormValues = {
    nome: "",
    descricao: "",
    responsavel: "",
    cliente: "",
    local: "",
    status: "PLANEJAMENTO",
    dataInicioPrevista: dataInicioSugerida,
    dataFimPrevista: "",
    observacoes: "",
  };
  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/admin/obra/cronograma"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para cronograma
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white">
          <CalendarRange className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Nova obra</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os dados gerais da obra. As tarefas e dependências são adicionadas em seguida.
          </p>
        </div>
      </div>

      <ObraForm mode="create" initialValues={initialValues} />
    </div>
  );
}
