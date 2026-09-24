import { OctagonAlert } from "lucide-react";

/**
 * Faixa vermelha dos formulários de cadastro abertos a partir da fila do CRM
 * (`?crmUc=`). O botão "Cadastrar" some da fila quando a adesão é excluída lá,
 * mas o link pode estar aberto numa aba ou ter sido copiado — e cadastrar aqui
 * seria cadastrar um negócio que foi desfeito.
 */
export function AvisoExcluidaNoCrm({
  excluidaNoCrmEm,
  motivoExclusaoCrm,
}: {
  excluidaNoCrmEm: string | null | undefined;
  motivoExclusaoCrm: string | null | undefined;
}) {
  if (!excluidaNoCrmEm) return null;
  const quando = new Date(excluidaNoCrmEm).toLocaleDateString("pt-BR");
  const oQue =
    motivoExclusaoCrm === "PROPOSTA_EXCLUIDA"
      ? "a proposta foi excluída"
      : motivoExclusaoCrm === "UC_RETIRADA_DA_ADESAO"
        ? "esta UC foi retirada do termo de adesão"
        : "a adesão foi excluída";

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border-2 border-red-600 bg-red-600 p-4 text-white shadow-lg shadow-red-600/30"
    >
      <OctagonAlert className="h-8 w-8 shrink-0 animate-pulse" />
      <div>
        <div className="text-base font-bold uppercase tracking-wide">
          Não cadastre: excluída no CRM em {quando}
        </div>
        <div className="text-sm text-red-50">
          No gerador de propostas, {oQue}. Os dados abaixo são a última versão lida antes
          da exclusão. Confirme com o vendedor antes de seguir.
        </div>
      </div>
    </div>
  );
}
