"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, AlertTriangle, Power, PowerOff } from "lucide-react";
import { UCForm, UCFormData, EMPTY_UC_FORM, percentDbToInput } from "@/components/consumer-units/uc-form";
import { UcCredentialsForm } from "@/components/consumer-units/uc-credentials-form";
import { UcBills } from "@/components/consumer-units/uc-bills";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExcluirUcDialog } from "@/components/consumer-units/excluir-uc-dialog";
import { DesativarUcDialog } from "@/components/consumer-units/desativar-uc-dialog";
import { DocumentosAdesao } from "@/components/consumer-units/documentos-adesao";
import {
  fichasDosDocumentosSalvos,
  type DocumentosDoCadastro,
} from "@/lib/documentos-adesao";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface UcStatusChange {
  id: string;
  ativa: boolean;
  motivo: string;
  usuarioNome: string;
  usuarioEmail: string | null;
  createdAt: string;
}

function formatDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export default function EditarUCPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialData, setInitialData] = useState<UCFormData>(EMPTY_UC_FORM);
  const [billsRefreshKey, setBillsRefreshKey] = useState(0);
  const [excluirOpen, setExcluirOpen] = useState(false);
  const [desativarOpen, setDesativarOpen] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [ativa, setAtiva] = useState(true);
  const [statusChanges, setStatusChanges] = useState<UcStatusChange[]>([]);
  // A papelada da adesão, copiada para dentro da UC quando ela foi cadastrada
  // pela fila do CRM. Fica fora de `initialData` de propósito: o formulário não
  // edita nem envia esses campos, só os exibe.
  const [documentos, setDocumentos] = useState<DocumentosDoCadastro | null>(null);

  const carregarUc = useCallback(() => {
    return fetch(`/api/consumer-units/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("UC não encontrada");
        return res.json();
      })
      .then((uc) => {
        setAtiva(!!uc.active);
        setStatusChanges(uc.statusChanges ?? []);
        setDocumentos(uc as DocumentosDoCadastro);
        setInitialData({
          nome: uc.nome ?? "",
          // Exibe no padrão da concessionária; a API normaliza pra dígitos ao salvar.
          codigoUc: formatCodigoUc(uc.codigoUc) ?? "",
          codigoUcAntigo: uc.codigoUcAntigo ?? "",
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
          dataInicioContrato: uc.dataInicioContrato
            ? new Date(uc.dataInicioContrato).toISOString().slice(0, 10)
            : "",
          loginDistribuidora: uc.loginDistribuidora ?? "",
          senhaDistribuidora: uc.senhaDistribuidora ?? "",
          temGeracaoPropria: !!uc.temGeracaoPropria,
        });
      })
      .catch(() => setError("Erro ao carregar UC"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    carregarUc();
  }, [carregarUc]);

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

  // Última mudança de status (a API já devolve em ordem decrescente). UC que
  // nunca foi desativada não tem registro — a faixa nem aparece.
  const ultimoStatus = statusChanges[0] ?? null;

  return (
    // Um pouco mais larga que as demais telas de edição: o painel de documentos
    // ocupa a coluna da direita e, em `max-w-4xl`, espremia o formulário.
    <div className="space-y-4 max-w-6xl">
      <Link
        href="/admin/unidades-consumidoras"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Editar Unidade Consumidora</h1>
          <Badge
            variant={ativa ? "default" : "secondary"}
            className={ativa ? "bg-emerald-500 hover:bg-emerald-600" : ""}
          >
            {ativa ? "Ativa" : "Inativa"}
          </Badge>
          <button
            type="button"
            onClick={() => setDesativarOpen(true)}
            title={
              ativa
                ? "Tira a UC do faturamento, da agenda e dos painéis, sem apagar nada"
                : "Devolve a UC ao faturamento, à agenda e aos painéis"
            }
            className={
              ativa
                ? "ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                : "ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
            }
          >
            {ativa ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {ativa ? "Desativar UC" : "Reativar UC"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Atualize os dados da UC</p>

        {ultimoStatus && (
          <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-medium">
                {ultimoStatus.ativa ? "Reativada" : "Desativada"} em{" "}
                {formatDataHora(ultimoStatus.createdAt)}
              </span>
              <span className="text-muted-foreground">
                por {ultimoStatus.usuarioNome}
                {ultimoStatus.usuarioEmail ? ` (${ultimoStatus.usuarioEmail})` : ""}
              </span>
              {statusChanges.length > 1 && (
                <button
                  type="button"
                  onClick={() => setHistoricoAberto((v) => !v)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  {historicoAberto
                    ? "Ocultar histórico"
                    : `Ver histórico (${statusChanges.length})`}
                </button>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5">Motivo: {ultimoStatus.motivo}</p>

            {historicoAberto && (
              <ul className="mt-2 space-y-1.5 border-t pt-2">
                {statusChanges.slice(1).map((mudanca) => (
                  <li key={mudanca.id} className="text-xs">
                    <span className="font-medium">
                      {mudanca.ativa ? "Reativada" : "Desativada"} em{" "}
                      {formatDataHora(mudanca.createdAt)}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      por {mudanca.usuarioNome} — {mudanca.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <UCForm
        initialData={initialData}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        cancelHref="/admin/unidades-consumidoras"
        submitLabel="Salvar Alterações"
        painelLateral={
          // Mesmo lugar da tela de cadastro — ao lado da Identificação: são
          // esses os campos que se conferem olhando o papel (o CNPJ digitado
          // contra o cartão CNPJ).
          <DocumentosAdesao
            fichas={fichasDosDocumentosSalvos(documentos)}
            adesaoIdCrm={documentos?.docsAdesaoIdCrm ?? null}
            copiadosEm={documentos?.docsCopiadosEm ?? null}
          />
        }
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
                Só é permitido enquanto a UC não tiver histórico. Faturas,
                faturamentos, rateios ou pagamentos vinculados bloqueiam a
                exclusão — nesse caso o caminho é desativar a UC.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setExcluirOpen(true)}
              className="shrink-0"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Excluir UC
            </Button>
          </div>
        </CardContent>
      </Card>

      <DesativarUcDialog
        ucId={id}
        ucNome={initialData.nome}
        ativa={ativa}
        open={desativarOpen}
        onOpenChange={setDesativarOpen}
        onConcluido={carregarUc}
      />

      <ExcluirUcDialog
        ucId={id}
        ucNome={initialData.nome}
        open={excluirOpen}
        onOpenChange={setExcluirOpen}
        onExcluida={() => router.push("/admin/unidades-consumidoras")}
      />
    </div>
  );
}
