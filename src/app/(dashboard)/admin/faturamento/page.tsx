"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ChevronLeft, ChevronRight, Plug } from "lucide-react";
import { formatMonthYear } from "@/lib/formatters";

const selectClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

export default function FaturamentoHubPage() {
  const now = useMemo(() => new Date(), []);
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  function prevMonth() {
    if (mes === 1) {
      setMes(12);
      setAno(ano - 1);
    } else {
      setMes(mes - 1);
    }
  }

  function nextMonth() {
    if (mes === 12) {
      setMes(1);
      setAno(ano + 1);
    } else {
      setMes(mes + 1);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie o faturamento de usinas e a cobrança de unidades consumidoras
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mês anterior"
              className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[200px] text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Mês de referência</p>
              <p className="text-2xl font-semibold capitalize">{formatMonthYear(mes, ano)}</p>
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Próximo mês"
              className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-end justify-center gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mês</label>
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={selectClass}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {formatMonthYear(m, ano).split(" ")[0]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano</label>
              <input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className={`${selectClass} w-24`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href={`/admin/faturamento/usinas/${mesRef}`}>
          <Card className="cursor-pointer hover:shadow-md hover:border-emerald-500 transition-all h-full">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Usinas</h2>
                  <p className="text-xs text-muted-foreground">Nota fiscal, recibos e comprovantes</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Selecione a usina, gere o relatório, anexe nota fiscal, recibo de terra,
                recibo de aluguel e o comprovante de pagamento referentes a{" "}
                <span className="font-medium text-foreground">{formatMonthYear(mes, ano)}</span>.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/admin/faturamento/unidades-consumidoras/${mesRef}`}>
          <Card className="cursor-pointer hover:shadow-md hover:border-blue-500 transition-all h-full">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  <Plug className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Unidades Consumidoras</h2>
                  <p className="text-xs text-muted-foreground">Cobranças via Asaas</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Gere as cobranças das UCs referentes a{" "}
                <span className="font-medium text-foreground">{formatMonthYear(mes, ano)}</span>.
                Integração com Asaas.com.br.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
