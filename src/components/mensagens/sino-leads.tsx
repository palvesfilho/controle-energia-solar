"use client";

/**
 * Sino do AURA: avisa o pós-venda quando um cliente toca no botão de uma
 * campanha.
 *
 * Fica no header de todas as telas do admin de propósito. O lead nasce quando
 * o cliente está com o celular na mão, e quem vai ligar está trabalhando em
 * outra tela — se o aviso só existisse dentro de Mensagens, só veria quem já
 * tivesse ido lá olhar, que é justamente o que não acontece.
 *
 * ⚠️ Isto é aviso DENTRO da ferramenta: só aparece para quem está logado. Aviso
 * fora do AURA (e-mail, WhatsApp) exige canal configurado — a `RESEND_API_KEY`
 * de produção é um placeholder e nenhum e-mail sai hoje.
 *
 * O contador some quando alguém marca o lead como atendido. Sem esse estado o
 * sino mostraria os mesmos nomes para sempre e o time aprenderia a ignorá-lo.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatInstantBR } from "@/lib/date-only";

interface Lead {
  id: string;
  interesseEm: string;
  oferta: string;
  campanhaNome: string;
  proprietarioId: string;
  nome: string;
  telefone: string | null;
}

/** De minuto em minuto. Lead não é dado de tempo real — ligar 60s depois é igual. */
const INTERVALO_MS = 60_000;

export function SinoLeads() {
  const [total, setTotal] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mensagens/leads-novos");
      if (!res.ok) return;
      const d = (await res.json()) as { total: number; leads: Lead[] };
      setTotal(d.total);
      setLeads(d.leads);
    } catch {
      // Silêncio: o header não pode quebrar por causa do sino.
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => {
      // Não consulta com a aba em segundo plano: o navegador acumularia
      // requisições e o time voltaria para uma rajada de chamadas iguais.
      if (document.visibilityState === "visible") void carregar();
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  return (
    <DropdownMenu>
      {/* O trigger deste dropdown já é o próprio botão (base-ui): envolver em
          <button> aninharia botão dentro de botão. Ver o menu do usuário no
          header, que segue o mesmo padrão. */}
      <DropdownMenuTrigger
        aria-label={
          total > 0 ? `${total} cliente(s) aguardando contato` : "Nenhum lead novo"
        }
        className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <div className="text-sm font-semibold">Clientes aguardando contato</div>
          <div className="text-[11px] text-muted-foreground">
            {total === 0
              ? "Ninguém na fila agora."
              : `${total} cliente(s) tocaram no botão de uma campanha.`}
          </div>
        </div>

        {leads.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {leads.map((l) => (
              <Link
                key={l.id}
                href="/admin/brasil-solar/mensagens"
                className="block border-b px-3 py-2 last:border-0 hover:bg-muted"
              >
                <div className="text-sm font-medium">{l.nome}</div>
                <div className="text-[11px] text-muted-foreground">
                  {l.oferta}
                  {l.telefone && ` · ${l.telefone}`}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {l.campanhaNome} · {formatInstantBR(new Date(l.interesseEm))}
                </div>
              </Link>
            ))}
          </div>
        )}

        <Link
          href="/admin/brasil-solar/mensagens"
          className="block px-3 py-2 text-center text-xs font-medium text-emerald-700 hover:bg-muted"
        >
          Ver todos em Mensagens
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
