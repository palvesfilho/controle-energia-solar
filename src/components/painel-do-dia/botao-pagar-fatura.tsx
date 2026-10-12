"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PagarFaturaDialog } from "@/components/agenda/pagar-fatura-dialog";

/**
 * Botão "Pagar" de uma conta de energia no Painel do Dia: abre a MESMA janela
 * de pagamento da Agenda da Semana, sem sair da fila. Ao confirmar, a página
 * recarrega os dados e a linha sai da fila.
 */
export function BotaoPagarFatura({ billId, rotulo }: { billId: string; rotulo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
      >
        {rotulo}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      {open && (
        <PagarFaturaDialog
          billId={billId}
          open
          // Só entra na fila o que ainda não foi pago: não há pagamento a editar.
          canEditPaid={false}
          onOpenChange={setOpen}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  );
}
