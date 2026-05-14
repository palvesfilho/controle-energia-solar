"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, CalendarRange, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ObraForm,
  ObraFormValues,
  obraInitialValues,
} from "@/components/obras/obra-form";

interface ObraData {
  id: string;
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  cliente: string | null;
  local: string | null;
  status: string;
  dataInicioPrevista: string | null;
  dataFimPrevista: string | null;
  observacoes: string | null;
}

export default function EditarObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [initial, setInitial] = useState<ObraFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/obras/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Obra não encontrada");
        return res.json();
      })
      .then((data: ObraData) => setInitial(obraInitialValues(data)))
      .catch(() => toast.error("Erro ao carregar obra"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir esta obra? Todas as tarefas e dependências serão removidas.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/obras/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Erro ao excluir obra");
        return;
      }
      toast.success("Obra excluída");
      router.push("/admin/obra/cronograma");
      router.refresh();
    } catch {
      toast.error("Erro de rede ao excluir obra");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href={`/admin/obra/cronograma/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para detalhes
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Editar obra</h1>
            <p className="text-sm text-muted-foreground">Atualize os dados gerais da obra</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deleting || loading}>
          <Trash2 className="mr-2 h-4 w-4" />
          {deleting ? "Excluindo…" : "Excluir obra"}
        </Button>
      </div>

      {loading || !initial ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : (
        <ObraForm mode="edit" obraId={id} initialValues={initial} />
      )}
    </div>
  );
}
