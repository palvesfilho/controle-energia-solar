"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Power, PowerOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mesmo mínimo cobrado pelas APIs (POST {basePath}/[id]/status) — motivo curto
// demais não explica nada pra quem ler a auditoria depois.
const MOTIVO_MIN = 10;

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Diálogo de ativação/desativação de cadastro, um só para usina e UC.
//
// Desativar é reversível e não apaga nada — por isso não exige a frase digitada
// do ExcluirCadastroDialog. A trava aqui é o motivo, que além de destravar o
// botão vira registro permanente junto com o usuário e a data.
//
// Contrato da API: POST {basePath}/{id}/status { active, motivo }.
export function DesativarCadastroDialog({
  registroId,
  nome,
  rotulo,
  ativa,
  efeitos,
  textoReativar,
  basePath,
  open,
  onOpenChange,
  onConcluido,
}: {
  registroId: string;
  nome: string;
  /** Como o cadastro é chamado na tela, no singular: "usina", "unidade consumidora". */
  rotulo: string;
  ativa: boolean;
  /** O que sai de circulação ao desativar — específico de cada cadastro. */
  efeitos: string[];
  /** Contrapartida na reativação, em uma frase. */
  textoReativar: string;
  /** Raiz da API do cadastro: "/api/plants", "/api/consumer-units". */
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluido: () => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const desativando = ativa;
  const motivoOk = motivo.trim().length >= MOTIVO_MIN;

  // Limpa a cada abertura pra o motivo de um cadastro não aparecer no próximo.
  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  function fechar() {
    if (salvando) return;
    onOpenChange(false);
  }

  async function confirmar() {
    if (!motivoOk) return;
    setSalvando(true);
    try {
      const res = await fetch(`${basePath}/${registroId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !desativando, motivo: motivo.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          desativando ? `Falha ao desativar ${rotulo}` : `Falha ao reativar ${rotulo}`,
          { description: err.error }
        );
        return;
      }

      toast.success(
        desativando
          ? `${capitalizar(rotulo)} ${nome} desativada`
          : `${capitalizar(rotulo)} ${nome} reativada`
      );
      onOpenChange(false);
      await onConcluido();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${
              desativando
                ? "bg-amber-100 dark:bg-amber-950/60"
                : "bg-emerald-100 dark:bg-emerald-950/60"
            }`}
          >
            {desativando ? (
              <PowerOff className="h-6 w-6 text-amber-600" />
            ) : (
              <Power className="h-6 w-6 text-emerald-600" />
            )}
          </div>
          <DialogTitle className="text-center text-lg">
            {desativando ? `Desativar ${rotulo}?` : `Reativar ${rotulo}?`}
          </DialogTitle>
          <DialogDescription className="text-center">
            {desativando ? (
              <>
                <span className="font-semibold text-foreground">{nome}</span>{" "}
                sairá das rotinas do sistema, mas nada é apagado.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">{nome}</span>{" "}
                volta a participar das rotinas do sistema.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {desativando ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-sm">
            <div className="font-medium text-amber-800 dark:text-amber-300">
              Ao desativar, a {rotulo}:
            </div>
            <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-300">
              {efeitos.map((efeito) => (
                <li key={efeito}>{efeito}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/80">
              Faturas, relatórios e todo o histórico continuam salvos, e a {rotulo}{" "}
              segue visível na listagem como Inativa. Você pode reativar quando
              quiser por este mesmo botão.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            {textoReativar}
          </div>
        )}

        <div className="space-y-1.5 mt-2">
          <label htmlFor="motivo-status-cadastro" className="block text-sm font-medium">
            {desativando ? "Motivo da desativação" : "Motivo da reativação"}
            <span className="text-red-600"> *</span>
          </label>
          <textarea
            id="motivo-status-cadastro"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            disabled={salvando}
            placeholder={
              desativando
                ? "Ex.: contrato encerrado com o cliente em 31/07/2026"
                : "Ex.: contrato retomado, volta a compensar neste ciclo"
            }
            className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none disabled:opacity-60"
          />
          <p className="text-xs text-muted-foreground">
            Fica registrado com o seu usuário e a data e hora desta ação.
            {!motivoOk && motivo.length > 0 && (
              <span className="text-amber-600">
                {" "}
                Faltam {MOTIVO_MIN - motivo.trim().length} caractere(s).
              </span>
            )}
          </p>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={salvando || !motivoOk}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              desativando
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {salvando
              ? desativando
                ? "Desativando..."
                : "Reativando..."
              : desativando
                ? `Desativar ${rotulo}`
                : `Reativar ${rotulo}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
