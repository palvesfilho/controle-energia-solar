"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface ImpactoResponse {
  nome: string;
  bloqueios: string[];
  avisos: string[];
  podeExcluir: boolean;
}

// Diálogo de exclusão de cadastro, um só para usina e UC (e para o próximo que
// vier). Dupla proteção: frase digitada + bloqueio por histórico, com o impacto
// consultado na API assim que abre, pra o operador ver o que some junto.
//
// O contrato que a API precisa cumprir:
//   GET  {basePath}/{id}/exclusao → { nome, bloqueios[], avisos[], podeExcluir }
//   DELETE {basePath}/{id}        → 409 + { error, details[] } quando há histórico
//
// Os rótulos são todos femininos ("a usina", "a unidade consumidora"), por isso
// não há parâmetro de gênero. Se um dia entrar um cadastro masculino, ele vira
// parâmetro em vez de virar um segundo diálogo.
export function ExcluirCadastroDialog({
  registroId,
  nome,
  rotulo,
  frase,
  basePath,
  open,
  onOpenChange,
  onExcluido,
}: {
  registroId: string | null;
  nome: string;
  /** Como o cadastro é chamado na tela, no singular: "usina", "unidade consumidora". */
  rotulo: string;
  /** Frase exata que o operador precisa digitar. */
  frase: string;
  /** Raiz da API do cadastro: "/api/plants", "/api/consumer-units". */
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExcluido: (id: string) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [impacto, setImpacto] = useState<ImpactoResponse | null>(null);
  const [carregandoImpacto, setCarregandoImpacto] = useState(false);

  const fraseBate = confirmText.trim().toLowerCase() === frase;
  const bloqueado = impacto !== null && !impacto.podeExcluir;

  useEffect(() => {
    if (!open || !registroId) return;
    setConfirmText("");
    setImpacto(null);
    setCarregandoImpacto(true);
    let cancelado = false;

    fetch(`${basePath}/${registroId}/exclusao`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ImpactoResponse | null) => {
        if (!cancelado) setImpacto(data);
      })
      .catch(() => {
        if (!cancelado) setImpacto(null);
      })
      .finally(() => {
        if (!cancelado) setCarregandoImpacto(false);
      });

    return () => {
      cancelado = true;
    };
  }, [open, registroId, basePath]);

  function fechar() {
    if (deleting) return;
    onOpenChange(false);
  }

  async function confirmarExclusao() {
    if (!registroId || !fraseBate || bloqueado) return;
    setDeleting(true);
    try {
      const res = await fetch(`${basePath}/${registroId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.details)) {
          toast.error("Não é possível excluir", {
            description: `Histórico existente: ${data.details.join(", ")}`,
          });
        } else {
          toast.error(data.error ?? `Falha ao excluir ${rotulo}`);
        }
        return;
      }

      toast.success(`${capitalizar(rotulo)} ${nome} excluída`);
      onExcluido(registroId);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <DialogTitle className="text-center text-lg">Excluir {rotulo}?</DialogTitle>
          <DialogDescription className="text-center">
            Você está prestes a excluir{" "}
            <span className="font-semibold text-foreground">{nome}</span>.
            <br />
            <span className="text-red-600 font-medium">
              Esta ação é permanente e não pode ser desfeita.
            </span>
          </DialogDescription>
        </DialogHeader>

        {carregandoImpacto ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando vínculos...
          </div>
        ) : bloqueado ? (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-sm">
            <div className="font-medium text-red-700 dark:text-red-300">
              Esta {rotulo} tem histórico e não pode ser excluída:
            </div>
            <ul className="mt-1 list-disc pl-5 text-red-700 dark:text-red-300">
              {impacto?.bloqueios.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-red-600/80 dark:text-red-300/80">
              Para tirar de circulação sem perder o histórico, use o botão
              &quot;Desativar {rotulo}&quot; nesta mesma tela.
            </div>
          </div>
        ) : (
          <>
            {impacto && impacto.avisos.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 text-sm">
                <div className="font-medium text-amber-800 dark:text-amber-300">
                  Ao excluir, também acontece:
                </div>
                <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-300">
                  {impacto.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 mt-2">
              <label className="block text-sm font-medium">
                Para confirmar, digite a frase abaixo:
              </label>
              <div className="rounded-md bg-muted px-3 py-2 text-sm font-mono select-all">
                {frase}
              </div>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Digite a frase exata aqui"
                autoFocus
                disabled={deleting}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
              />
            </div>
          </>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={fechar}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
          >
            {bloqueado ? "Fechar" : "Cancelar"}
          </button>
          {!bloqueado && (
            <button
              type="button"
              onClick={confirmarExclusao}
              disabled={!fraseBate || deleting || carregandoImpacto}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
