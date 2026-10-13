"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CANAIS_CONTATO,
  CANAL_CONTATO_LABEL,
  RESULTADOS_CONTATO,
  RESULTADO_CONTATO_LABEL,
  type CanalContato,
  type ResultadoContato,
} from "@/lib/acoes-diarias-contato";

const inputClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

interface BotaoRegistrarContatoProps {
  nome: string;
  telefone: string | null;
  alvo: { clientId?: string; proprietarioId?: string; alertaId?: string };
}

/**
 * Botão "Registrar contato" de uma linha de Ações Diárias. Grava o que foi
 * feito (canal, resultado, observação) sem sair da fila — não envia nada ao
 * cliente. Ao salvar, a página recarrega e a linha passa para "em andamento".
 */
export function BotaoRegistrarContato({ nome, telefone, alvo }: BotaoRegistrarContatoProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [canal, setCanal] = useState<CanalContato>("LIGACAO");
  const [resultado, setResultado] = useState<ResultadoContato | "">("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!resultado) {
      toast.error("Escolha o resultado do contato.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/brasil-solar/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...alvo, canal, resultado, observacao }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Erro ao registrar o contato.");
        return;
      }
      toast.success("Contato registrado.");
      setOpen(false);
      setResultado("");
      setObservacao("");
      router.refresh();
    } catch {
      toast.error("Erro ao registrar o contato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
      >
        <PhoneCall className="h-3.5 w-3.5" />
        Registrar contato
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar contato</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div className="font-medium">{nome}</div>
                <div className="text-xs text-muted-foreground">
                  {telefone ?? "Sem telefone no cadastro"}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Canal</span>
                <select
                  className={inputClass}
                  value={canal}
                  onChange={(e) => setCanal(e.target.value as CanalContato)}
                >
                  {CANAIS_CONTATO.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_CONTATO_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Resultado</span>
                <select
                  className={inputClass}
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value as ResultadoContato | "")}
                >
                  <option value="">Escolha…</option>
                  {RESULTADOS_CONTATO.map((r) => (
                    <option key={r} value={r}>
                      {RESULTADO_CONTATO_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  O que foi conversado (opcional)
                </span>
                <textarea
                  className={inputClass}
                  rows={3}
                  maxLength={2000}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </label>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar contato
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
