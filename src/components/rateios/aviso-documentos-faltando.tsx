"use client";

/**
 * Aviso âmbar, na montagem do rateio, das UCs que não têm os documentos que a
 * RGE pede. Aparece ANTES do portal da concessionária: descobrir a falta só na
 * hora de anexar é descobrir tarde. Avisa, não trava — quem decide se segue é o
 * operador.
 */

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataBr, type ValidadeCartaoCnpj } from "@/lib/cartao-cnpj";
import {
  AtalhoCartaoCnpj,
  AvisoCartaoCnpjAssociacao,
} from "@/components/rateios/validade-cartao-cnpj";

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
      <AvisoCartaoCnpjAssociados ids={linhas.map((l) => l.id)} />
      {pendentes.length > 0 && <AvisoUcs pendentes={pendentes} />}
    </>
  );
}

interface CartaoDoAssociado {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  validade: ValidadeCartaoCnpj;
}

/**
 * O cartão CNPJ de cada associado do rateio que precisa ser atualizado: a RGE
 * recusa o emitido há mais de 6 meses, e o aviso começa aos 5.
 *
 * A data sai do arquivo, lida no servidor — por isso a consulta é à parte e
 * espera o operador parar de mexer na lista (cada UC que entra ou sai mudaria a
 * pergunta). Enquanto ela não volta, nada aparece: aviso atrasado é melhor que
 * aviso inventado.
 */
function AvisoCartaoCnpjAssociados({ ids }: { ids: string[] }) {
  const [cartoes, setCartoes] = useState<CartaoDoAssociado[]>([]);
  // Sobe a cada cartão trocado, para a consulta refazer e o aviso sumir sozinho.
  const [versao, setVersao] = useState(0);
  const chave = [...ids].sort().join(",");

  useEffect(() => {
    // Lista vazia não precisa limpar o estado: o render só mostra o cartão de
    // quem ainda está na tela.
    if (!chave) return;
    let cancelado = false;
    const espera = setTimeout(() => {
      fetch("/api/rateios/cartoes-cnpj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerUnitIds: chave.split(",") }),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((lista: CartaoDoAssociado[]) => {
          if (!cancelado && Array.isArray(lista)) setCartoes(lista);
        })
        // Complemento: se falhar, a montagem do rateio segue sem este aviso.
        .catch(() => {});
    }, 700);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [chave, versao]);

  const naTela = new Set(ids);
  const atuais = cartoes.filter((c) => naTela.has(c.id));
  const atualizar = atuais.filter(
    (c) => c.validade.situacao === "vencido" || c.validade.situacao === "vencendo",
  );
  const semData = atuais.filter((c) => c.validade.situacao === "sem_data");
  if (atualizar.length === 0 && semData.length === 0) return null;

  const algumVencido = atualizar.some((c) => c.validade.situacao === "vencido");

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        algumVencido
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1.5">
        {atualizar.length > 0 && (
          <>
            <p className="font-semibold">
              {atualizar.length === 1
                ? "O cartão CNPJ de 1 UC deste rateio precisa ser atualizado."
                : `O cartão CNPJ de ${atualizar.length} UCs deste rateio precisa ser atualizado.`}{" "}
              A RGE não aceita cartão emitido há mais de 6 meses.
            </p>
            <ul className="space-y-0.5">
              {atualizar.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.nome}</span> — emitido em{" "}
                  {dataBr(c.validade.emitidoEm)},{" "}
                  {c.validade.situacao === "vencido"
                    ? `vencido desde ${dataBr(c.validade.aceitoAte)}`
                    : `aceito só até ${dataBr(c.validade.aceitoAte)}`}
                  <AtalhoCartaoCnpj
                    cnpj={c.cpfCnpj}
                    consumerUnitId={c.id}
                    onTrocado={() => setVersao((v) => v + 1)}
                    className="ml-2 align-middle"
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        {semData.length > 0 && (
          <>
            <p>
              <span className="font-medium">Confira à mão</span> a data do cartão CNPJ destas
              UCs: o arquivo é escaneado e a data de emissão não pôde ser lida. Na dúvida, emita
              outro.
            </p>
            <ul className="space-y-0.5">
              {semData.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.nome}</span>
                  <AtalhoCartaoCnpj
                    cnpj={c.cpfCnpj}
                    consumerUnitId={c.id}
                    onTrocado={() => setVersao((v) => v + 1)}
                    className="ml-2 align-middle"
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
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
