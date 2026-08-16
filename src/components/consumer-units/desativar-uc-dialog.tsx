"use client";

import { DesativarCadastroDialog } from "@/components/shared/desativar-cadastro-dialog";

// Onde `ConsumerUnit.active` manda de verdade — conferido nas consultas:
// api/billing/consumer-units, lib/agenda.ts, lib/analise-creditos.ts,
// admin/page.tsx e as rotas de rateio da usina.
const EFEITOS_DESATIVAR = [
  "Sai do Faturamento mensal das UCs — deixa de ser cobrada",
  "Some da Agenda da Semana (tarefas de leitura e fatura)",
  "Sai da Análise de Créditos e dos indicadores do painel admin",
  "Deixa de ser candidata a novos rateios da usina",
  "Não sai dos rateios JÁ vigentes — a versão em vigor continua como está",
];

const TEXTO_REATIVAR =
  "Ela volta a ser cobrada no Faturamento, volta à Agenda da Semana, à Análise de Créditos e à lista de candidatas a rateio.";

// Desativar/reativar unidade consumidora — regra e tela no DesativarCadastroDialog.
export function DesativarUcDialog({
  ucId,
  ucNome,
  ativa,
  open,
  onOpenChange,
  onConcluido,
}: {
  ucId: string;
  ucNome: string;
  ativa: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluido: () => void | Promise<void>;
}) {
  return (
    <DesativarCadastroDialog
      registroId={ucId}
      nome={ucNome}
      rotulo="unidade consumidora"
      ativa={ativa}
      efeitos={EFEITOS_DESATIVAR}
      textoReativar={TEXTO_REATIVAR}
      basePath="/api/consumer-units"
      open={open}
      onOpenChange={onOpenChange}
      onConcluido={onConcluido}
    />
  );
}
