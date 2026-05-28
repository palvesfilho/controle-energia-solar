"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Download, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MESES_LABEL = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const BANCOS = [
  { value: "C6_BANK", label: "C6 Bank" },
  { value: "C6_BANK", label: "Banrisul" },
  { value: "ASAAS", label: "Asaas" },
] as const;

const BANCO_LABEL: Record<string, string> = {
  C6_BANK: "C6 Bank",
  BANRISUL: "Banrisul",
  ASAAS: "Asaas",
};

const inputClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

interface FaturaParaPagar {
  id: string;
  ano: number;
  mes: number;
  valorTotal: number | null;
  vencimento: string | null;
  codigoBarras: string | null;
  pixCopiaCola: string | null;
  pdfUrl: string | null;
  pagoEm: string | null;
  bancoPagamento: string | null;
  origemPagamento: string | null;
  comprovantePagamentoUrl: string | null;
  uc: { codigoUc: string; nome: string; distribuidora: string | null } | null;
}

function formatBRL(v: number | null): string {
  if (v == null) return "-";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function isoToInputDate(iso: string | null): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

interface PagarFaturaDialogProps {
  billId: string | null;
  open: boolean;
  canEditPaid: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PagarFaturaDialog({ billId, open, canEditPaid, onOpenChange, onSuccess }: PagarFaturaDialogProps) {
  const [fatura, setFatura] = useState<FaturaParaPagar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pagoEm, setPagoEm] = useState(() => new Date().toISOString().slice(0, 10));
  const [banco, setBanco] = useState<string>("C6_BANK");
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !billId) {
      setFatura(null);
      setEditMode(false);
      return;
    }
    setCarregando(true);
    setFatura(null);
    setEditMode(false);
    setComprovante(null);
    fetch(`/api/admin/faturas-energia/${billId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar"))))
      .then((j) => {
        const f = j as FaturaParaPagar;
        setFatura(f);
        setPagoEm(isoToInputDate(f.pagoEm));
        setBanco(f.bancoPagamento ?? "C6_BANK");
      })
      .catch(() => {
        toast.error("Erro ao carregar fatura");
        onOpenChange(false);
      })
      .finally(() => setCarregando(false));
  }, [billId, open, onOpenChange]);

  const jaPaga = !!fatura?.pagoEm;
  // 3 modos:
  //  - register: nunca foi paga → formulário pra registrar (qualquer role com acesso)
  //  - view: já paga, sem permissão de edição → só mostra
  //  - edit: já paga, com permissão (ADMIN/GESTOR), depois de clicar "Editar"
  const mode: "register" | "view" | "edit" = !jaPaga
    ? "register"
    : editMode
      ? "edit"
      : "view";

  const copiar = async (texto: string, label: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const confirmar = async () => {
    if (!fatura) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("pagoEm", pagoEm);
      formData.append("banco", banco);
      if (comprovante) formData.append("comprovante", comprovante);
      const res = await fetch(`/api/admin/faturas-energia/${fatura.id}/pagar`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(mode === "edit" ? "Erro ao atualizar pagamento" : "Erro ao registrar pagamento", { description: err.error });
        return;
      }
      toast.success(mode === "edit" ? "Pagamento atualizado" : "Pagamento registrado");
      onOpenChange(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  const tituloPorModo: Record<typeof mode, string> = {
    register: "Pagar fatura",
    view: "Detalhes do pagamento",
    edit: "Editar pagamento",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {tituloPorModo[mode]}
            {fatura && fatura.mes > 0 ? ` · ${MESES_LABEL[fatura.mes - 1]}/${fatura.ano}` : ""}
          </DialogTitle>
        </DialogHeader>
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fatura...
          </div>
        ) : fatura && fatura.uc ? (
          <div className="space-y-3 text-sm">
            {/* Resumo UC + valor — sempre aparece */}
            <div className="rounded border bg-muted/30 p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">UC:</span>
                <span className="font-medium">
                  {fatura.uc.codigoUc} — {fatura.uc.nome}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vencimento:</span>
                <span className="font-medium">{formatDate(fatura.vencimento)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor:</span>
                <span className="font-bold text-base">{formatBRL(fatura.valorTotal)}</span>
              </div>
              {fatura.pdfUrl && (
                <div className="pt-1">
                  <a
                    href={fatura.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"
                  >
                    <Download className="h-3 w-3" /> Baixar PDF da fatura
                  </a>
                </div>
              )}
            </div>

            {/* Bloco "Pagamento registrado" — aparece em view/edit */}
            {jaPaga && (
              <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                    Pagamento registrado
                  </span>
                  {mode === "view" && canEditPaid && (
                    <button
                      type="button"
                      onClick={() => setEditMode(true)}
                      className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-100"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  )}
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-medium">{formatDate(fatura.pagoEm)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Banco:</span>
                  <span className="font-medium">
                    {fatura.bancoPagamento ? BANCO_LABEL[fatura.bancoPagamento] ?? fatura.bancoPagamento : "-"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Origem:</span>
                  <span className="font-medium">{fatura.origemPagamento ?? "-"}</span>
                </div>
                {fatura.comprovantePagamentoUrl && (
                  <div className="pt-0.5">
                    <a
                      href={fatura.comprovantePagamentoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800"
                    >
                      <Download className="h-3 w-3" /> Baixar comprovante
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Código de barras / PIX — só em register */}
            {mode === "register" && fatura.codigoBarras && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Código de barras
                </label>
                <div className="flex items-stretch gap-1.5">
                  <input
                    readOnly
                    value={fatura.codigoBarras}
                    className={`${inputClass} w-full font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => copiar(fatura.codigoBarras!, "Código de barras")}
                    className="inline-flex items-center gap-1 rounded border px-2 text-xs hover:bg-muted transition-colors"
                    title="Copiar"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {mode === "register" && fatura.pixCopiaCola && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  PIX Copia e Cola
                </label>
                <div className="flex items-stretch gap-1.5">
                  <textarea
                    readOnly
                    value={fatura.pixCopiaCola}
                    rows={2}
                    className={`${inputClass} w-full font-mono text-[10px] leading-tight`}
                  />
                  <button
                    type="button"
                    onClick={() => copiar(fatura.pixCopiaCola!, "PIX")}
                    className="inline-flex items-center gap-1 rounded border px-2 text-xs hover:bg-muted transition-colors"
                    title="Copiar"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {mode === "register" && !fatura.codigoBarras && !fatura.pixCopiaCola && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Sem código de barras nem PIX cadastrado nessa fatura.
              </p>
            )}

            {/* Formulário (register ou edit) */}
            {(mode === "register" || mode === "edit") && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Data do pagamento
                    </label>
                    <input
                      type="date"
                      value={pagoEm}
                      onChange={(e) => setPagoEm(e.target.value)}
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pago via
                    </label>
                    <select
                      value={banco}
                      onChange={(e) => setBanco(e.target.value)}
                      className={`${inputClass} w-full`}
                    >
                      {BANCOS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Comprovante {mode === "edit" ? "(substitui o atual se enviado)" : "(opcional)"}
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted/80"
                  />
                </div>

                {mode === "edit" && (
                  <p className="text-xs text-muted-foreground italic">
                    A origem será atualizada para o seu nome ao salvar.
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "view" ? "Fechar" : "Cancelar"}
          </button>
          {(mode === "register" || mode === "edit") && (
            <button
              type="button"
              onClick={confirmar}
              disabled={saving || !fatura}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> {mode === "edit" ? "Salvar alterações" : "Confirmar pagamento"}
                </>
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
