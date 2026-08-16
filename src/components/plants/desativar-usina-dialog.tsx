"use client";

import { DesativarCadastroDialog } from "@/components/shared/desativar-cadastro-dialog";

// O que some quando a usina fica inativa — a lista existe porque `active` não é
// só uma etiqueta: ele filtra faturamento, agenda, painel e análise de créditos.
const EFEITOS_DESATIVAR = [
  "Sai do Faturamento mensal (lista, matriz e pendências)",
  "Deixa de gerar tarefas na Agenda da Semana (pagar investidor, emitir relatório)",
  "Sai dos indicadores e da lista de usinas do painel admin",
  "Sai da Análise de Créditos",
];

const TEXTO_REATIVAR =
  "Ela volta a aparecer no Faturamento, na Agenda da Semana, no painel admin e na Análise de Créditos.";

// Desativar/reativar usina — regra e tela no DesativarCadastroDialog.
export function DesativarUsinaDialog({
  plantId,
  plantName,
  ativa,
  open,
  onOpenChange,
  onConcluido,
}: {
  plantId: string;
  plantName: string;
  ativa: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluido: () => void | Promise<void>;
}) {
  return (
    <DesativarCadastroDialog
      registroId={plantId}
      nome={plantName}
      rotulo="usina"
      ativa={ativa}
      efeitos={EFEITOS_DESATIVAR}
      textoReativar={TEXTO_REATIVAR}
      basePath="/api/plants"
      open={open}
      onOpenChange={onOpenChange}
      onConcluido={onConcluido}
    />
  );
}
