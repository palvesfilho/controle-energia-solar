"use client";

/**
 * Sino da primeira compensação: avisa que uma UC de desconto começou a receber
 * abatimento na fatura e já pode ser cobrada.
 *
 * Fica no header, ao lado do sino de leads, pelo mesmo motivo dele: o fato
 * nasce quando a fatura da distribuidora é importada — de madrugada, por um
 * cron — e quem cobra está trabalhando em outra tela. Se o aviso só existisse
 * dentro de Unidades Consumidoras, só veria quem já tivesse ido lá olhar, que é
 * justamente o que não acontece. Na base de 21/08/2026 a espera entre entrar no
 * contrato e o desconto aparecer chegou a 8 faturas.
 *
 * O contador zera quando alguém libera a cobrança da UC. Sem esse estado o sino
 * mostraria os mesmos nomes pra sempre e o time aprenderia a ignorá-lo.
 *
 * ⚠️ Aviso DENTRO da ferramenta: só aparece pra quem está logado. Aviso fora do
 * AURA (e-mail, WhatsApp) exige canal configurado — a `RESEND_API_KEY` de
 * produção é um placeholder e nenhum e-mail sai hoje.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PiggyBank } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface Nova {
  id: string;
  nome: string;
  codigoUc: string;
  consumidor: string | null;
  primeiraCompensacao: string;
  faturasSemCompensacao: number;
}

/**
 * De 5 em 5 minutos. A fatura entra por importação/cron, não em tempo real —
 * saber 5 minutos depois é igual, e o header não precisa de tráfego à toa.
 */
const INTERVALO_MS = 300_000;

export function SinoCompensacoes() {
  const [total, setTotal] = useState(0);
  const [novas, setNovas] = useState<Nova[]>([]);
  const [emImplantacao, setEmImplantacao] = useState(0);
  const [atrasadas, setAtrasadas] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/consumer-units/primeiras-compensacoes");
      if (!res.ok) return;
      const d = (await res.json()) as {
        total: number;
        novas: Nova[];
        emImplantacao: number;
        atrasadas: number;
      };
      setTotal(d.total);
      setNovas(d.novas);
      setEmImplantacao(d.emImplantacao);
      setAtrasadas(d.atrasadas);
    } catch {
      // Silêncio: o header não pode quebrar por causa do sino.
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => {
      // Não consulta com a aba em segundo plano: o navegador acumularia
      // requisições e o time voltaria pra uma rajada de chamadas iguais.
      if (document.visibilityState === "visible") void carregar();
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          total > 0
            ? `${total} UC(s) com primeira compensação, prontas para cobrar`
            : "Nenhuma UC nova para cobrar"
        }
        className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <PiggyBank className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <div className="text-sm font-semibold">Prontas para cobrar</div>
          <div className="text-[11px] text-muted-foreground">
            {total === 0
              ? "Nenhuma UC estreou o desconto desde a última liberação."
              : `${total} UC(s) tiveram a primeira compensação na fatura.`}
          </div>
        </div>

        {novas.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {novas.map((uc) => (
              <Link
                key={uc.id}
                href="/admin/unidades-consumidoras?fase=faturando&novas=1"
                className="block border-b px-3 py-2 last:border-0 hover:bg-muted"
              >
                <div className="text-sm font-medium">{uc.nome}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCodigoUc(uc.codigoUc)}
                  {uc.consumidor && ` · ${uc.consumidor}`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  1ª compensação em {uc.primeiraCompensacao}
                  {uc.faturasSemCompensacao > 0 &&
                    ` · esperou ${uc.faturasSemCompensacao} conta(s)`}
                </div>
              </Link>
            ))}
          </div>
        )}

        {emImplantacao > 0 && (
          <Link
            href="/admin/unidades-consumidoras?fase=implantacao"
            className="block border-t px-3 py-2 text-center text-xs font-medium text-emerald-700 hover:bg-muted"
          >
            {emImplantacao} em implantação
            {atrasadas > 0 && ` · ${atrasadas} esperando demais`}
          </Link>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
