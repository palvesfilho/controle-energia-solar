"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { UCForm, UCFormData, EMPTY_UC_FORM, percentDbToInput } from "@/components/consumer-units/uc-form";
import { UcCredentialsForm } from "@/components/consumer-units/uc-credentials-form";
import { UcBills } from "@/components/consumer-units/uc-bills";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function EditarUCPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialData, setInitialData] = useState<UCFormData>(EMPTY_UC_FORM);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/consumer-units/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("UC não encontrada");
        return res.json();
      })
      .then((uc) => {
        setInitialData({
          nome: uc.nome ?? "",
          codigoUc: uc.codigoUc ?? "",
          consumerId: uc.consumerId ?? "",
          plantId: uc.plantId ?? "",
          cpfCnpj: uc.cpfCnpj ?? "",
          distribuidora: uc.distribuidora ?? "",
          grupo: uc.grupo ?? "",
          subGrupo: uc.subGrupo ?? "",
          modalidade: uc.modalidade ?? "",
          consumoMedio: uc.consumoMedio?.toString() ?? "",
          cep: uc.cep ?? "",
          logradouro: uc.logradouro ?? "",
          complemento: uc.complemento ?? "",
          numero: uc.numero ?? "",
          cidade: uc.cidade ?? "",
          consultor: uc.consultor ?? "",
          comissao: uc.comissao ?? "",
          metodoPagamento: uc.metodoPagamento ?? "",
          regraRemuneracao: uc.regraRemuneracao ?? "",
          percentCompensado: percentDbToInput(uc.percentCompensado),
          percentBandeira: percentDbToInput(uc.percentBandeira),
          regraVencimento: uc.regraVencimento ?? "",
          valorVencimento: uc.valorVencimento?.toString() ?? "",
          statusContrato: uc.statusContrato ?? "Ativo",
          vigenciaCompensacao: uc.vigenciaCompensacao ?? "",
          loginDistribuidora: uc.loginDistribuidora ?? "",
          senhaDistribuidora: uc.senhaDistribuidora ?? "",
          temGeracaoPropria: !!uc.temGeracaoPropria,
        });
      })
      .catch(() => setError("Erro ao carregar UC"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/consumer-units/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Erro ao excluir UC" }));
        toast.error(d.error || "Erro ao excluir UC");
        setDeleting(false);
        return;
      }
      toast.success("Unidade consumidora excluída");
      router.push("/admin/unidades-consumidoras");
    } catch {
      toast.error("Erro de conexão");
      setDeleting(false);
    }
  };

  const handleSubmit = async (data: UCFormData) => {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/consumer-units/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        router.push("/admin/unidades-consumidoras");
      } else {
        const d = await res.json();
        setError(d.error || "Erro ao atualizar UC");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin/unidades-consumidoras"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Editar Unidade Consumidora</h1>
        <p className="text-sm text-muted-foreground">Atualize os dados da UC</p>
      </div>

      <UCForm
        initialData={initialData}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        cancelHref="/admin/unidades-consumidoras"
        submitLabel="Salvar Alterações"
      />

      <Separator />

      <div className="space-y-3">
        <UcCredentialsForm
          consumerUnitId={id}
          defaultInstalacao={initialData.codigoUc}
          onSyncComplete={() => setBillsRefreshKey((k) => k + 1)}
        />
      </div>

      <div className="space-y-3">
        <UcBills consumerUnitId={id} refreshKey={billsRefreshKey} />
      </div>

      <Separator />

      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Zona de perigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Excluir esta unidade consumidora</p>
              <p className="text-xs text-muted-foreground">
                Remove a UC e todos os dados vinculados (credenciais, faturas sincronizadas, billings).
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Excluir UC
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Confirmar exclusão
            </DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a unidade consumidora{" "}
              <span className="font-semibold text-foreground">{initialData.nome}</span>{" "}
              (código <span className="font-mono">{initialData.codigoUc}</span>)?
              <br />
              <br />
              Essa operação removerá permanentemente a UC e todos os registros
              relacionados. Não é possível desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Sim, excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
