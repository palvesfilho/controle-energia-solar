"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Download, Loader2 } from "lucide-react";
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
  { value: "BANRISUL", label: "Banrisul" },
  { value: "ASAAS", label: "Asaas" },
] as const;

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

interface PagarFaturaDialogProps {
  billId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PagarFaturaDialog({ billId, open, onOpenChange, onSuccess }: PagarFaturaDialogProps) {
  const [fatura, setFatura] = useState<FaturaParaPagar | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pagoEm, setPagoEm] = useState(() => new Date().toISOString().slice(0, 10));
  const [banco, setBanco] = useState<string>("BANRISUL");
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !billId) {
      setFatura(null);
      return;
    }
    setCarregando(true);
    setFatura(null);
    setPagoEm(new Date().toISOString().slice(0, 10));
    setBanco("BANRISUL");
    setComprovante(null);
    fetch(`/api/admin/faturas-energia/${billId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar"))))
      .then((j) => setFatura(j as FaturaParaPagar))
      .catch(() => {
        toast.error("Erro ao carregar fatura");
        onOpenChange(false);
      })
      .finally(() => setCarregando(false));
  }, [billId, open, onOpenChange]);

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
        toast.error("Erro ao registrar pagamento", { description: err.error });
        return;
      }
      toast.success("Pagamento registrado");
      onOpenChange(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Pagar fatura
            {fatura && fatura.mes > 0 ? ` · ${MESES_LABEL[fatura.mes - 1]}/${fatura.ano}` : ""}
          </DialogTitle>
        </DialogHeader>
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fatura...
          </div>
        ) : fatura && fatura.uc ? (
          <div className="space-y-3 text-sm">
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

            {fatura.codigoBarras && (
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

            {fatura.pixCopiaCola && (
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

            {!fatura.codigoBarras && !fatura.pixCopiaCola && (
              <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                Sem código de barras nem PIX cadastrado nessa fatura.
              </p>
            )}

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
                Comprovante (opcional)
              </label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
                className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted/80"
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
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
                <Check className="h-4 w-4" /> Confirmar pagamento
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
