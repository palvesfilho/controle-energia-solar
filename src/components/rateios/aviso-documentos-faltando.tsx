"use client";

/**
 * Aviso âmbar, na montagem do rateio, das UCs que não têm os documentos que a
 * RGE pede. Aparece ANTES do portal da concessionária: descobrir a falta só na
 * hora de anexar é descobrir tarde. Avisa, não trava — quem decide se segue é o
 * operador.
 */

import { TriangleAlert } from "lucide-react";
import { AvisoCartaoCnpjAssociacao } from "@/components/rateios/validade-cartao-cnpj";

export interface LinhaComDocumentos {
  id: string;
  nome: string;
  /** Rótulos do que falta. `undefined` = a tela não sabe; não se afirma nada. */
  docsFaltando?: string[];
}

export function AvisoDocumentosFaltando({ linhas }: { linhas: LinhaComDocumentos[] }) {
  const pendentes = linhas.filter((l) => l.docsFaltando && l.docsFaltando.length > 0);

  return (
    <>
      {/* O cartão CNPJ da associação vale para todo rateio: o aviso dele não
          depende das UCs escolhidas, então aparece mesmo com tudo em dia aqui. */}
      <AvisoCartaoCnpjAssociacao />
      {pendentes.length > 0 && <AvisoUcs pendentes={pendentes} />}
    </>
  );
}

function AvisoUcs({ pendentes }: { pendentes: LinhaComDocumentos[] }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1.5">
        <p className="font-semibold">
          {pendentes.length === 1
            ? "1 UC deste rateio está com documento faltando."
            : `${pendentes.length} UCs deste rateio estão com documento faltando.`}{" "}
          Precisamos destes documentos para avançar na criação do rateio na RGE.
        </p>
        <ul className="space-y-0.5">
          {pendentes.map((l) => (
            <li key={l.id}>
              <span className="font-medium">{l.nome}</span> — falta {l.docsFaltando!.join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
