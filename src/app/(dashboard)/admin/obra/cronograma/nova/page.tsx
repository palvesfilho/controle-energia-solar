import Link from "next/link";
import { ChevronLeft, CalendarRange } from "lucide-react";
import { ObraForm, type ObraFormValues } from "@/components/obras/obra-form";

const INITIAL_VALUES: ObraFormValues = {
  nome: "",
  descricao: "",
  responsavel: "",
  cliente: "",
  local: "",
  status: "PLANEJAMENTO",
  dataInicioPrevista: "",
  dataFimPrevista: "",
  observacoes: "",
};

export default function NovaObraPage() {
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

      <ObraForm mode="create" initialValues={INITIAL_VALUES} />
    </div>
  );
}
