"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  Search,
  Square,
  X,
} from "lucide-react";
import { PlantBillingDetail } from "@/components/billing/plant-billing-detail";
import { formatBRL, formatMonthYear, shortMonth } from "@/lib/formatters";
import { useFiltroTabela, type Faceta } from "@/lib/filtro-tabela";
import { ExportarTabela } from "@/components/ui/exportar-tabela";
import { FiltroColuna } from "@/components/ui/filtro-coluna";

/* ------------------------------------------------------------------ */
/* Tipos — espelham GET /api/billing/plants/matriz                      */
/* ------------------------------------------------------------------ */

interface Celula {
  ano: number;
  mes: number;
  billingId: string | null;
  status: string;
  valorTotal: number | null;
  totalDevido: number;
  encerrado: boolean;
  pendente: boolean;
}

interface UsinaRow {
  plantId: string;
  name: string;
  numeroUsina: string | null;
  cpfCnpj: string | null;
  distribuidora: string | null;
  investorNames: string[];
  celulas: Celula[];
  qtdPendentes: number;
  primeiroPendente: { ano: number; mes: number } | null;
  totalDevidoPendente: number;
}

/** Fora do componente para a identidade do array não mudar a cada render. */
const FACETAS: Faceta<UsinaRow>[] = [
  {
    chave: "investidor",
    label: "Investidor",
    // Usina com mais de um investidor aparece no filtro de qualquer um deles.
    valor: (u) => u.investorNames,
  },
];

interface Matriz {
  meses: Array<{ ano: number; mes: number }>;
  usinas: UsinaRow[];
}

interface Aberto {
  plantId: string;
  ano: number;
  mes: number;
  billingId: string;
}

interface FilaItem {
  plantId: string;
  ano: number;
  mes: number;
}

/* ------------------------------------------------------------------ */
/* Aparência dos status                                                 */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  string,
  { label: string; sigla: string; cell: string; dot: string }
> = {
  PAGO: {
    label: "Pago",
    sigla: "pago",
    cell: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  AGUARDANDO_PAGAMENTO: {
    label: "Aguardando pagamento",
    sigla: "pgto",
    cell: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  AGUARDANDO_DOCUMENTOS: {
    label: "Aguardando documentos",
    sigla: "docs",
    cell: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  PENDENTE: {
    label: "Pendente",
    sigla: "•",
    cell: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  NAO_FATURADO: {
    label: "Nunca faturado",
    sigla: "—",
    cell:
      "border border-dashed border-muted-foreground/40 text-muted-foreground/70",
    dot: "bg-muted-foreground/30",
  },
  FORA_CONTRATO: {
    label: "Fora do contrato",
    sigla: "",
    cell: "text-muted-foreground/30",
    dot: "bg-transparent",
  },
  FUTURO: {
    label: "Mês futuro",
    sigla: "",
    cell: "text-muted-foreground/20",
    dot: "bg-transparent",
  },
};

function meta(status: string) {
  return STATUS_META[status] ?? STATUS_META.PENDENTE;
}

const inputClass =
  "text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";

function mesParam(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function mesCurto(ano: number, mes: number) {
  return `${shortMonth(mes).toLowerCase()}/${String(ano).slice(-2)}`;
}

function mesmaCelula(a: FilaItem | Aberto | null, b: FilaItem | Aberto | null) {
  if (!a || !b) return false;
  return a.plantId === b.plantId && a.ano === b.ano && a.mes === b.mes;
}

/**
 * Mês que entra na fila de trabalho: tem faturamento aberto ou dinheiro
 * devido ao investidor. Mês NAO_FATURADO fica de fora de propósito — ele
 * aparece na matriz e no contador "nunca faturados", mas não é fila: quase
 * sempre é usina que ainda não estava operando, não trabalho represado.
 */
function temTrabalho(c: Celula) {
  return c.pendente && (c.billingId !== null || c.totalDevido > 0);
}

/** Célula que não abre tela nenhuma: antes do contrato ou ainda no futuro. */
function naoAbrivel(status: string) {
  return status === "FORA_CONTRATO" || status === "FUTURO";
}

/** Desloca uma referência ano/mês em N meses. */
function shiftMes(ref: { ano: number; mes: number }, delta: number) {
  const d = new Date(ref.ano, ref.mes - 1, 1);
  d.setMonth(d.getMonth() + delta);
  return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
}

/* ------------------------------------------------------------------ */

export default function FaturamentoUsinasPage() {
  const hoje = useMemo(() => new Date(), []);
  /** A grade é sempre um ano-calendário fechado: janeiro a dezembro. */
  const [ano, setAno] = useState(() => hoje.getFullYear());

  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const [fila, setFila] = useState<FilaItem[] | null>(null);
  const [filaTotalInicial, setFilaTotalInicial] = useState(0);

  /**
   * Mês que o usuário pediu pela seta mas está fora da janela carregada.
   * Fica pendente até a matriz da janela nova chegar (ver efeito abaixo).
   */
  const [pendenteAbrir, setPendenteAbrir] = useState<
    (FilaItem & { direcao: number }) | null
  >(null);

  const ehFuturo = useCallback(
    (m: { ano: number; mes: number }) =>
      m.ano > hoje.getFullYear() ||
      (m.ano === hoje.getFullYear() && m.mes > hoje.getMonth() + 1),
    [hoje],
  );

  // Restaura ?usina=&mes= uma única vez, depois que a matriz chega.
  const restaurou = useRef(false);

  const carregarMatriz = useCallback(async () => {
    const qs = `de=${ano}-01&ate=${ano}-12`;
    const r = await fetch(`/api/billing/plants/matriz?${qs}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErro(j.error ?? "Falha ao carregar a matriz de faturamento.");
      return;
    }
    setErro(null);
    setMatriz(await r.json());
  }, [ano]);

  useEffect(() => {
    setLoading(true);
    carregarMatriz().finally(() => setLoading(false));
  }, [carregarMatriz]);

  /* ---------------- abrir / fechar uma célula ---------------- */

  const abrirCelula = useCallback(
    async (plantId: string, ano: number, mes: number, billingId: string | null) => {
      const chave = `${plantId}|${ano}|${mes}`;
      if (billingId) {
        setAberto({ plantId, ano, mes, billingId });
        return;
      }
      // Sem PlantBilling ainda: cria o placeholder e abre em cima dele.
      setAbrindo(chave);
      try {
        const res = await fetch("/api/billing/plants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plantId, ano, mes }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setErro(j.error ?? "Não foi possível abrir o faturamento deste mês.");
          return;
        }
        const billing = await res.json();
        setAberto({ plantId, ano, mes, billingId: billing.id });
        // Guarda o id recém-criado pra não repetir o POST no próximo clique.
        setMatriz((m) =>
          m
            ? {
                ...m,
                usinas: m.usinas.map((u) =>
                  u.plantId !== plantId
                    ? u
                    : {
                        ...u,
                        celulas: u.celulas.map((c) =>
                          c.ano === ano && c.mes === mes
                            ? { ...c, billingId: billing.id }
                            : c,
                        ),
                      },
                ),
              }
            : m,
        );
      } finally {
        setAbrindo(null);
      }
    },
    [],
  );

  /**
   * Clique manual numa célula. Abrir um mês que nunca foi faturado *cria* o
   * PlantBilling — com 200+ células tracejadas na grade, um clique errado
   * viraria registro no banco sem ninguém perceber. Quando há dinheiro devido
   * o mês é trabalho legítimo e abre direto, sem perguntar.
   */
  const abrirComGuarda = useCallback(
    (usina: UsinaRow, c: Celula) => {
      if (!c.billingId && c.totalDevido === 0) {
        const ok = window.confirm(
          `${usina.name} nunca teve faturamento em ${formatMonthYear(c.mes, c.ano)}.\n\n` +
            "Abrir cria o faturamento deste mês para esta usina. Continuar?",
        );
        if (!ok) return;
      }
      abrirCelula(usina.plantId, c.ano, c.mes, c.billingId);
    },
    [abrirCelula],
  );

  // Sincroniza a URL sem recarregar a rota (mantém o link colável).
  useEffect(() => {
    const base = "/admin/faturamento/usinas";
    const url = aberto
      ? `${base}?usina=${aberto.plantId}&mes=${mesParam(aberto.ano, aberto.mes)}`
      : base;
    window.history.replaceState(null, "", url);
  }, [aberto]);

  /**
   * A seta pediu um mês fora da janela: assim que a matriz da janela nova
   * chega, abre esse mês (pulando meses fora do contrato na mesma direção).
   */
  useEffect(() => {
    if (!pendenteAbrir || !matriz) return;
    const naJanela = matriz.meses.some(
      (m) => m.ano === pendenteAbrir.ano && m.mes === pendenteAbrir.mes,
    );
    if (!naJanela) return; // ainda é a matriz antiga — espera a próxima
    const u = matriz.usinas.find((x) => x.plantId === pendenteAbrir.plantId);
    setPendenteAbrir(null);
    if (!u) return;
    let i = u.celulas.findIndex(
      (c) => c.ano === pendenteAbrir.ano && c.mes === pendenteAbrir.mes,
    );
    while (i >= 0 && i < u.celulas.length) {
      const c = u.celulas[i];
      if (!naoAbrivel(c.status)) {
        abrirComGuarda(u, c);
        return;
      }
      i += pendenteAbrir.direcao;
    }
  }, [matriz, pendenteAbrir, abrirComGuarda]);

  // Abre direto o que veio na URL (link salvo/compartilhado).
  useEffect(() => {
    if (restaurou.current || !matriz) return;
    restaurou.current = true;
    const sp = new URLSearchParams(window.location.search);
    const plantId = sp.get("usina");
    const mes = sp.get("mes");
    if (!plantId || !mes) return;
    const m = mes.match(/^(\d{4})-(\d{2})$/);
    if (!m) return;
    const ano = Number(m[1]);
    const mesNum = Number(m[2]);
    const usina = matriz.usinas.find((u) => u.plantId === plantId);
    const cel = usina?.celulas.find((c) => c.ano === ano && c.mes === mesNum);
    if (usina) abrirCelula(plantId, ano, mesNum, cel?.billingId ?? null);
  }, [matriz, abrirCelula]);

  /* ---------------- fila ---------------- */

  const iniciarFila = () => {
    if (!matriz) return;
    // A ordem vem pronta do endpoint: usinas com pendência mais antiga
    // primeiro, e dentro de cada usina os meses em ordem cronológica.
    const itens: FilaItem[] = [];
    for (const u of matriz.usinas) {
      for (const c of u.celulas) {
        if (temTrabalho(c)) itens.push({ plantId: u.plantId, ano: c.ano, mes: c.mes });
      }
    }
    if (itens.length === 0) {
      setErro("Nenhum mês em aberto na janela — está tudo fechado.");
      return;
    }
    setErro(null);
    setFila(itens);
    setFilaTotalInicial(itens.length);
    const p = itens[0];
    const cel = matriz.usinas
      .find((u) => u.plantId === p.plantId)
      ?.celulas.find((c) => c.ano === p.ano && c.mes === p.mes);
    abrirCelula(p.plantId, p.ano, p.mes, cel?.billingId ?? null);
  };

  const sairFila = () => {
    setFila(null);
    setFilaTotalInicial(0);
  };

  /** Situação atual de uma célula da fila, relida da matriz. */
  const celulaDe = useCallback(
    (item: FilaItem | Aberto): Celula | null => {
      const u = matriz?.usinas.find((x) => x.plantId === item.plantId);
      return u?.celulas.find((c) => c.ano === item.ano && c.mes === item.mes) ?? null;
    },
    [matriz],
  );

  const usinaDe = useCallback(
    (plantId: string) => matriz?.usinas.find((u) => u.plantId === plantId) ?? null,
    [matriz],
  );

  const filaPos = useMemo(() => {
    if (!fila || !aberto) return -1;
    return fila.findIndex((f) => mesmaCelula(f, aberto));
  }, [fila, aberto]);

  const filaResolvidos = useMemo(() => {
    if (!fila) return 0;
    return fila.filter((f) => !celulaDe(f)?.pendente).length;
  }, [fila, celulaDe]);

  const proximoPendente = useMemo(() => {
    if (!fila) return null;
    const depois = filaPos >= 0 ? fila.slice(filaPos + 1) : fila;
    const alvo =
      depois.find((f) => celulaDe(f)?.pendente) ??
      fila.find((f) => celulaDe(f)?.pendente && !mesmaCelula(f, aberto));
    return alvo ?? null;
  }, [fila, filaPos, celulaDe, aberto]);

  const irPara = (item: FilaItem) => {
    const cel = celulaDe(item);
    abrirCelula(item.plantId, item.ano, item.mes, cel?.billingId ?? null);
  };

  /* ---------------- navegação dentro da usina aberta ---------------- */

  const usinaAberta = aberto ? usinaDe(aberto.plantId) : null;
  const celulaAberta = aberto ? celulaDe(aberto) : null;

  const trocarMes = (delta: number) => {
    if (!usinaAberta || !aberto) return;
    const idx = usinaAberta.celulas.findIndex(
      (c) => c.ano === aberto.ano && c.mes === aberto.mes,
    );
    let i = idx + delta;
    while (i >= 0 && i < usinaAberta.celulas.length) {
      const c = usinaAberta.celulas[i];
      if (!naoAbrivel(c.status)) {
        abrirComGuarda(usinaAberta, c);
        return;
      }
      i += delta;
    }
    // Chegou na virada do ano (dezembro → janeiro, ou janeiro → dezembro).
    // Em vez de morrer em silêncio, troca o ano e abre o mês adjacente
    // assim que a matriz do ano novo chegar.
    const alvo = shiftMes({ ano: aberto.ano, mes: aberto.mes }, delta);
    if (delta > 0 && ehFuturo(alvo)) return;
    setPendenteAbrir({ plantId: aberto.plantId, ...alvo, direcao: delta });
    setAno(alvo.ano);
  };

  const trocarUsina = (plantId: string) => {
    if (!matriz || !aberto) return;
    const u = matriz.usinas.find((x) => x.plantId === plantId);
    if (!u) return;
    // Mantém o mês escolhido; se a usina não tem esse mês, cai no último válido.
    // Preferência: o mesmo mês, desde que já exista faturamento lá. Trocar de
    // usina não pode criar registro no banco em silêncio — se o mês escolhido
    // nunca foi faturado nessa usina, cai no mês mais recente que já tem
    // faturamento; só pergunta se a usina não tiver nenhum.
    const mesmo = u.celulas.find(
      (c) => c.ano === aberto.ano && c.mes === aberto.mes && !naoAbrivel(c.status),
    );
    if (mesmo && (mesmo.billingId || mesmo.totalDevido > 0)) {
      abrirCelula(plantId, mesmo.ano, mesmo.mes, mesmo.billingId);
      return;
    }
    const comFaturamento = [...u.celulas]
      .reverse()
      .find((c) => c.billingId || c.totalDevido > 0);
    if (comFaturamento) {
      abrirCelula(plantId, comFaturamento.ano, comFaturamento.mes, comFaturamento.billingId);
      return;
    }
    const alvo =
      mesmo ??
      [...u.celulas].reverse().find((c) => !naoAbrivel(c.status)) ??
      u.celulas[u.celulas.length - 1];
    abrirComGuarda(u, alvo);
  };

  // Setas ←/→ trocam o mês enquanto a tela de trabalho está aberta.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        trocarMes(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        trocarMes(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, usinaAberta]);

  /* ---------------- resumo da janela ---------------- */

  const resumo = useMemo(() => {
    if (!matriz) return { emAberto: 0, devido: 0, nuncaFaturados: 0 };
    let emAberto = 0;
    let devido = 0;
    let nuncaFaturados = 0;
    for (const u of matriz.usinas) {
      for (const c of u.celulas) {
        if (temTrabalho(c)) emAberto++;
        if (c.pendente) devido += c.totalDevido;
        if (c.status === "NAO_FATURADO") nuncaFaturados++;
      }
    }
    return { emAberto, devido, nuncaFaturados };
  }, [matriz]);

  // "Só com pendência" vem antes das facetas: é um recorte da base, e o seletor
  // de investidor deve oferecer só quem existe dentro dele.
  const base = useMemo(() => {
    if (!matriz) return [];
    return soPendentes
      ? matriz.usinas.filter((u) => u.qtdPendentes > 0)
      : matriz.usinas;
  }, [matriz, soPendentes]);

  const filtro = useFiltroTabela(base, {
    busca: (u) => [u.name, u.numeroUsina, ...u.investorNames],
    facetas: FACETAS,
  });
  const usinasFiltradas = filtro.filtrados;

  // Os indicadores descrevem a lista que está embaixo deles — contam sobre
  // `usinasFiltradas`. O `resumo` global segue alimentando o botão "Iniciar
  // fila": ele é uma AÇÃO sobre toda a fila do mês, não um indicador da tela,
  // e estreitá-lo pelo filtro mudaria calado o que o lote processa.
  const resumoFiltrado = useMemo(() => {
    let emAberto = 0;
    let devido = 0;
    let nuncaFaturados = 0;
    for (const u of usinasFiltradas) {
      for (const c of u.celulas) {
        if (temTrabalho(c)) emAberto++;
        if (c.pendente) devido += c.totalDevido;
        if (c.status === "NAO_FATURADO") nuncaFaturados++;
      }
    }
    return { emAberto, devido, nuncaFaturados };
  }, [usinasFiltradas]);

  /** Mês corrente — alvo do link de validação em lote de faturas. */
  const mesAtual = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };

  /* ================================================================ */
  /* TELA DE TRABALHO                                                  */
  /* ================================================================ */

  if (aberto && usinaAberta) {
    const atualResolvido = celulaAberta ? !celulaAberta.pendente : false;
    // Só trava a seta pra frente no mês corrente — nas outras bordas ela
    // desloca a janela de 12 meses e continua andando.
    const semProximoMes = ehFuturo(shiftMes({ ano: aberto.ano, mes: aberto.mes }, 1));

    return (
      <div className="space-y-4">
        {/* régua: usina + 12 meses */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-background/95 backdrop-blur border-b flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAberto(null)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Mapa
          </button>

          <select
            value={aberto.plantId}
            onChange={(e) => trocarUsina(e.target.value)}
            className={`${inputClass} max-w-[220px]`}
            aria-label="Trocar de usina"
          >
            {matriz?.usinas.map((u) => (
              <option key={u.plantId} value={u.plantId}>
                {u.name}
                {u.qtdPendentes > 0 ? ` (${u.qtdPendentes})` : ""}
              </option>
            ))}
          </select>

          <div className="min-w-0 hidden md:block">
            <div className="text-sm font-semibold truncate">{usinaAberta.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {usinaAberta.investorNames.length > 0
                ? usinaAberta.investorNames.join(", ")
                : "sem investidor vinculado"}
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => trocarMes(-1)}
              className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
              aria-label="Mês anterior"
              title="Mês anterior (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex gap-1">
              {usinaAberta.celulas.map((c) => {
                const m = meta(c.status);
                const atual = c.ano === aberto.ano && c.mes === aberto.mes;
                const fora = naoAbrivel(c.status);
                return (
                  <button
                    key={`${c.ano}-${c.mes}`}
                    type="button"
                    disabled={fora}
                    onClick={() => abrirComGuarda(usinaAberta, c)}
                    title={`${formatMonthYear(c.mes, c.ano)} · ${m.label}`}
                    className="flex flex-col items-center gap-0.5 group disabled:cursor-default"
                  >
                    <span
                      className={`text-[9px] font-mono ${
                        atual ? "text-primary font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {mesCurto(c.ano, c.mes).slice(0, 3)}
                    </span>
                    <span
                      className={`h-5 w-7 rounded text-[9px] font-mono font-semibold flex items-center justify-center ${m.cell} ${
                        atual ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                      } ${fora ? "" : "group-hover:ring-2 group-hover:ring-primary/50"}`}
                    >
                      {c.status === "PAGO" ? "✓" : m.sigla}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={semProximoMes}
              onClick={() => trocarMes(1)}
              className="p-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Próximo mês"
              title={
                semProximoMes
                  ? "Este é o mês mais recente — não há faturamento futuro"
                  : "Próximo mês (→)"
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {fila && (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {filaPos >= 0
                ? `Fila ${filaPos + 1}/${filaTotalInicial}`
                : "Fora da ordem da fila"}
              <span className="h-1.5 w-12 rounded-full bg-primary/20 overflow-hidden">
                <span
                  className="block h-full bg-primary transition-all"
                  style={{
                    width: `${
                      filaTotalInicial
                        ? (filaResolvidos / filaTotalInicial) * 100
                        : 0
                    }%`,
                  }}
                />
              </span>
            </span>
          )}
        </div>

        {/* a tela de detalhe de sempre, agora embutida */}
        <PlantBillingDetail
          key={aberto.billingId}
          billingId={aberto.billingId}
          embedded
          onChanged={carregarMatriz}
        />

        {/* rodapé da fila */}
        <div className="sticky bottom-0 z-20 -mx-4 px-4 py-2.5 bg-background/95 backdrop-blur border-t flex flex-wrap items-center gap-3">
          {fila ? (
            <>
              <span className="text-sm text-muted-foreground">
                {filaResolvidos} de {filaTotalInicial} resolvidos
                {proximoPendente && (
                  <>
                    {" · próximo: "}
                    <span className="font-medium text-foreground">
                      {usinaDe(proximoPendente.plantId)?.name}
                    </span>{" "}
                    {formatMonthYear(proximoPendente.mes, proximoPendente.ano)}
                    {proximoPendente.plantId === aberto.plantId
                      ? " — mesma usina"
                      : " — próximo investidor"}
                  </>
                )}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={sairFila}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted transition-colors"
                >
                  <Square className="h-3.5 w-3.5" />
                  Sair da fila
                </button>
                <button
                  type="button"
                  disabled={!proximoPendente}
                  onClick={() => proximoPendente && irPara(proximoPendente)}
                  className={`inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    atualResolvido
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border hover:bg-muted"
                  }`}
                >
                  {atualResolvido ? "✓ Mês resolvido — próximo" : "Próximo pendente"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">
                {celulaAberta?.pendente
                  ? "Mês pendente. Use ← → para andar pelos meses desta usina."
                  : "Mês resolvido. Use ← → para andar pelos meses desta usina."}
              </span>
              <button
                type="button"
                onClick={iniciarFila}
                className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Play className="h-3.5 w-3.5" />
                Iniciar fila ({resumo.emAberto})
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /* MAPA                                                              */
  /* ================================================================ */

  return (
    <div className="space-y-4">
      <Link
        href="/admin/faturamento"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Faturamento de Usinas</h1>
          <p className="text-sm text-muted-foreground">
            Clique na célula do mês para abrir o faturamento, ou inicie a fila para
            percorrer as pendências na ordem.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar usina ou investidor..."
              value={filtro.busca}
              onChange={(e) => filtro.setBusca(e.target.value)}
              className={`${inputClass} pl-8 w-56`}
            />
          </div>
          <button
            type="button"
            aria-pressed={soPendentes}
            onClick={() => setSoPendentes((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              soPendentes
                ? "bg-primary/10 border-primary text-primary"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            Só com pendência
          </button>
          <ExportarTabela
            tabela="faturamento-usinas"
            nome="faturamento-usinas"
            aba="Faturamento"
          />
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm flex items-center gap-2">
          <span className="flex-1">{erro}</span>
          <button
            type="button"
            onClick={() => setErro(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-5">
          <div>
            <div className="text-lg font-bold tabular-nums">{resumoFiltrado.emAberto}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              meses em aberto
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-lg font-bold tabular-nums">
              {formatBRL(resumoFiltrado.devido)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              a pagar aos investidores
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-lg font-bold tabular-nums text-destructive">
              {resumoFiltrado.nuncaFaturados}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              meses nunca faturados
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAno((a) => a - 1)}
                className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
                title={`Ver ${ano - 1}`}
                aria-label="Ano anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold tabular-nums px-2">{ano}</span>
              <button
                type="button"
                disabled={ano >= hoje.getFullYear()}
                onClick={() => setAno((a) => a + 1)}
                className="p-1.5 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40"
                title={
                  ano >= hoje.getFullYear() ? "Não há faturamento futuro" : `Ver ${ano + 1}`
                }
                aria-label="Próximo ano"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {fila ? (
              <button
                type="button"
                onClick={sairFila}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Sair da fila
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || resumo.emAberto === 0}
                onClick={iniciarFila}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Iniciar fila ({resumo.emAberto})
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-3">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando...
            </div>
          ) : usinasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma usina encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0" data-tabela="faturamento-usinas">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide text-muted-foreground border-b">
                      Usina / investidor
                      <FiltroColuna filtro={filtro} chave="investidor" />
                    </th>
                    {matriz?.meses.map((m, i) => (
                      <th
                        key={`${m.ano}-${m.mes}`}
                        className={`py-2 px-1 font-medium text-[10px] uppercase tracking-wide border-b whitespace-nowrap ${
                          i === (matriz?.meses.length ?? 0) - 1
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {mesCurto(m.ano, m.mes)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usinasFiltradas.map((u) => (
                    <tr key={u.plantId} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-3 border-b min-w-[190px]">
                        <div className="font-medium whitespace-nowrap">{u.name}</div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {u.investorNames.length === 0
                            ? "—"
                            : u.investorNames.length === 1
                              ? u.investorNames[0]
                              : `${u.investorNames[0]} +${u.investorNames.length - 1}`}
                        </div>
                      </td>
                      {u.celulas.map((c) => {
                        const m = meta(c.status);
                        const fora = naoAbrivel(c.status);
                        const chave = `${u.plantId}|${c.ano}|${c.mes}`;
                        const posFila = fila
                          ? fila.findIndex(
                              (f) =>
                                f.plantId === u.plantId &&
                                f.ano === c.ano &&
                                f.mes === c.mes,
                            )
                          : -1;
                        return (
                          <td
                            key={`${c.ano}-${c.mes}`}
                            className="p-0 border-b"
                            // Na tela a sigla basta porque há legenda embaixo;
                            // na planilha, não — vai o rótulo por extenso.
                            data-export-valor={m.label}
                          >
                            <button
                              type="button"
                              disabled={fora || abrindo === chave}
                              onClick={() => abrirComGuarda(u, c)}
                              title={`${u.name} · ${formatMonthYear(c.mes, c.ano)} · ${m.label}${
                                c.totalDevido > 0
                                  ? ` · ${formatBRL(c.totalDevido)} a pagar`
                                  : ""
                              }`}
                              className="relative w-full min-w-[50px] h-10 px-1 flex items-center justify-center disabled:cursor-default group"
                            >
                              <span
                                className={`w-full h-7 rounded-md text-[10px] font-mono font-semibold flex items-center justify-center ${m.cell} ${
                                  fora ? "" : "group-hover:ring-2 group-hover:ring-primary"
                                }`}
                              >
                                {abrindo === chave ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  m.sigla
                                )}
                              </span>
                              {posFila >= 0 && (
                                <span className="absolute top-0 right-1 text-[9px] font-mono font-bold text-muted-foreground">
                                  {posFila + 1}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground items-center pt-1">
            {[
              "PAGO",
              "AGUARDANDO_PAGAMENTO",
              "AGUARDANDO_DOCUMENTOS",
              "PENDENTE",
              "NAO_FATURADO",
              "FORA_CONTRATO",
              "FUTURO",
            ].map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-3.5 w-3.5 rounded ${meta(s).cell}`} />
                {meta(s).label}
              </span>
            ))}
            <Link
              href={`/admin/faturamento/usinas/${mesParam(mesAtual.ano, mesAtual.mes)}`}
              className="ml-auto inline-flex items-center gap-1 hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
              title="Lista do mês com a validação inversor × medidor de todas as usinas"
            >
              Validar faturas de {formatMonthYear(mesAtual.mes, mesAtual.ano)}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
