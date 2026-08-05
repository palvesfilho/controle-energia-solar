"use client";

/**
 * Escolha do mês de início do backfill de faturas.
 *
 * Antes o botão baixava um número fixo de meses cravado no código, o que não
 * servia: quem opera sabe de onde quer puxar o histórico, e esse ponto muda de
 * cliente para cliente. Aqui ele escolhe o mês/ano de início; o download vai
 * dali até a competência mais recente.
 *
 * Quanto mais fundo, mais demorado só na PRIMEIRA vez de cada UC: as faturas que
 * já estão no Gestor são puladas, não rebaixadas.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, Info } from "lucide-react";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Quantos meses separam (ano, mes) do mês atual, contando o atual. */
export function mesesDesde(ano: number, mes: number): number {
  const hoje = new Date();
  const diff =
    (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes) + 1;
  return Math.max(1, diff);
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Recebe quantos meses buscar, contados do mês escolhido até hoje. */
  onConfirmar: (meses: number, rotulo: string) => void;
  /** Quantas UCs serão percorridas — o operador merece saber antes de começar. */
  totalUcs: number;
}

export function BackfillInicioDialog({
  open,
  onOpenChange,
  onConfirmar,
  totalUcs,
}: Props) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  // Padrão: 12 meses atrás. É o histórico que a maioria quer e evita que um
  // clique distraído puxe anos de fatura de dezenas de UCs.
  const padrao = new Date(anoAtual, hoje.getMonth() - 11, 1);
  const [ano, setAno] = useState(padrao.getFullYear());
  const [mes, setMes] = useState(padrao.getMonth() + 1);

  // 8 anos de alcance. Casa com MESES_MAX (96) da rota: o que dá para escolher
  // aqui é o que ela aceita, senão a tela prometeria um período maior do que o
  // buscado de fato.
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual - i);
  const total = mesesDesde(ano, mes);
  const rotulo = `${MESES[mes - 1]}/${ano}`;
  // Mês futuro não existe em fatura nenhuma.
  const invalido = ano > anoAtual || (ano === anoAtual && mes > hoje.getMonth() + 1);
  // O mês mais antigo que dá para pedir. Anunciado na tela para ninguém supor um
  // alcance que não existe — e para o operador saber que, se precisar de algo mais
  // antigo, o caminho é outro (upload manual).
  const limiteAno = anos[anos.length - 1];

  const atalhos = [3, 6, 12, 24].map((n) => {
    const d = new Date(anoAtual, hoje.getMonth() - (n - 1), 1);
    return { n, ano: d.getFullYear(), mes: d.getMonth() + 1 };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Sincronizar faturas antigas
          </DialogTitle>
          <DialogDescription>
            Baixa as faturas no portal da concessionária a partir do mês
            escolhido e grava cada uma na sua UC. Faturas que já estão aqui são
            puladas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => {
              const ativo = a.ano === ano && a.mes === mes;
              return (
                <button
                  key={a.n}
                  type="button"
                  onClick={() => {
                    setAno(a.ano);
                    setMes(a.mes);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    ativo
                      ? "bg-green-700 border-green-700 text-white"
                      : "hover:bg-muted"
                  }`}
                >
                  {a.n} meses
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="backfill-mes"
                className="text-xs font-medium text-muted-foreground"
              >
                Mês de início
              </label>
              <select
                id="backfill-mes"
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm capitalize"
              >
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1} className="capitalize">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="backfill-ano"
                className="text-xs font-medium text-muted-foreground"
              >
                Ano
              </label>
              <select
                id="backfill-ano"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>Busca limitada a janeiro/{limiteAno}</strong> — a
              concessionária mantém a segunda via por tempo determinado, e mesmo
              dentro desse período uma fatura pode não estar disponível. Para
              faturas mais antigas, use o upload manual.
            </span>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {invalido ? (
              <span className="text-destructive">
                Esse mês ainda não aconteceu. Escolha um mês até{" "}
                {MESES[hoje.getMonth()]}/{anoAtual}.
              </span>
            ) : (
              <>
                Vai buscar de <strong className="text-foreground capitalize">{rotulo}</strong>{" "}
                até hoje ({total} {total === 1 ? "mês" : "meses"}) em{" "}
                <strong className="text-foreground">
                  {totalUcs} {totalUcs === 1 ? "UC" : "UCs"}
                </strong>
                , uma de cada vez. Pode levar alguns minutos por UC.
                {" "}
                <span className="block mt-1">
                  Faturas que já estão aqui são <strong className="text-foreground">puladas</strong>,
                  não baixadas de novo — dá para repetir com um mês mais antigo
                  que só o pedaço que falta é buscado.
                </span>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-green-700 hover:bg-green-800"
            disabled={invalido}
            onClick={() => {
              onOpenChange(false);
              onConfirmar(total, rotulo);
            }}
          >
            <History className="h-4 w-4 mr-1.5" />
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
