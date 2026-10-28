"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, Check, X, Search, ShieldCheck, OctagonAlert } from "lucide-react";
import { matchBusca } from "@/lib/busca";
import { ROTULO_UNIDADE, type UnidadeExecucao } from "@/lib/execucao-obra-regras";

interface ObraPendente {
  id: string;
  nome: string;
  cliente: string | null;
  local: string | null;
  createdAt: string;
  brasilSolarProprietarioId: string | null;
  execucao: {
    numeroProposta: string | null;
    quantidade: number | null;
    unidade: UnidadeExecucao | null;
    valorUnitario: number | null;
    valorMinimo: number | null;
    tetoPeloMinimo: boolean;
    tetoCalculado: number | null;
    limiteQtdAutomatico: number | null;
    aguardandoAdmin: boolean;
    autorizado: {
      valor: number;
      motivo: string | null;
      por: string | null;
      em: string | null;
    } | null;
    teto: number | null;
    /** A venda foi desfeita no gerador (perdida ou excluída) depois de gerar a obra. */
    vendaDesfeita: { em: string; motivo: string | null } | null;
  } | null;
  /** Quem está vendo é admin e pode definir o máximo desta obra. */
  podeAutorizar?: boolean;
}

/**
 * Máximo AUTORIZADO pelo admin: projeto grande negociado à parte ou acréscimo
 * extraordinário. Só aparece para o trio admin; o motivo é obrigatório.
 */
function AutorizarTeto({
  obraId,
  autorizadoAtual,
  onSalvo,
}: {
  obraId: string;
  autorizadoAtual: number | null;
  onSalvo: () => void;
}) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(remover: boolean) {
    const numero = lerValor(valor);
    if (!remover && (numero == null || !motivo.trim())) {
      toast.error("Informe o máximo autorizado e o motivo.");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(`/api/obras/${obraId}/teto-execucao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remover ? { valor: null } : { valor: numero, motivo }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      toast.success(remover ? "Autorização removida." : "Máximo autorizado.");
      setValor("");
      setMotivo("");
      onSalvo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        Admin — autorizar máximo
      </div>
      <Input
        inputMode="decimal"
        className="h-8 w-32"
        placeholder="Máximo R$"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      />
      <Input
        className="h-8 min-w-[16rem] flex-1"
        placeholder="Motivo (ex.: projeto grande negociado, telhado de difícil acesso)"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <Button size="sm" variant="secondary" disabled={salvando} onClick={() => enviar(false)}>
        Autorizar
      </Button>
      {autorizadoAtual != null && (
        <Button size="sm" variant="ghost" disabled={salvando} onClick={() => enviar(true)}>
          Remover autorização
        </Button>
      )}
    </div>
  );
}

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "1.234,56" ou "1234.56" → número. Vazio ou inválido → null. */
function lerValor(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (!limpo) return null;
  // Vírgula é decimal; sem vírgula, "1.500" é mil e quinhentos, não 1,5.
  const normalizado =
    limpo.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const VENDA_DESFEITA: Record<string, { titulo: string; texto: string }> = {
  VENDA_PERDIDA: {
    titulo: "Venda perdida",
    texto: "No gerador de propostas, esta venda foi marcada como perdida depois de ganha.",
  },
  PROPOSTA_EXCLUIDA: {
    titulo: "Venda excluída",
    texto: "No gerador de propostas, a proposta desta obra foi excluída.",
  },
  ADESAO_EXCLUIDA: {
    titulo: "Venda excluída",
    texto: "No gerador de propostas, a adesão desta obra foi excluída.",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

export default function AprovacaoObrasPage() {
  const [obras, setObras] = useState<ObraPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/obras?aprovacao=PENDENTE")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          let detail = text.slice(0, 300) || "(resposta vazia)";
          try {
            const j = JSON.parse(text);
            detail = [j.error, j.hint].filter(Boolean).join(" — ") || detail;
          } catch {}
          throw new Error(`HTTP ${res.status}: ${detail}`);
        }
        return res.json();
      })
      .then((data) => setObras(Array.isArray(data) ? data : []))
      .catch((err: Error) => {
        console.error("Erro ao carregar obras pendentes:", err);
        toast.error(`Erro ao carregar obras pendentes: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function decidir(obraId: string, aprovacao: "ACEITA" | "RECUSADA") {
    setActing(obraId);
    try {
      const res = await fetch(`/api/obras/${obraId}/aprovacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aprovacao,
          ...(aprovacao === "ACEITA" ? { valorExecucao: lerValor(valores[obraId] ?? "") } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let detail = text || `HTTP ${res.status}`;
        try {
          detail = JSON.parse(text).error ?? detail;
        } catch {}
        throw new Error(detail);
      }
      toast.success(
        aprovacao === "ACEITA"
          ? "Obra aceita e enviada ao cronograma."
          : "Obra recusada."
      );
      setObras((prev) => prev.filter((o) => o.id !== obraId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setActing(null);
    }
  }

  // Venda desfeita no gerador vai para o topo: é a que o gestor precisa ver
  // antes de mandar equipe. `sort` é estável, o resto mantém a ordem da API.
  const filtered = obras
    .filter((o) => matchBusca(search, [o.nome, o.cliente, o.local]))
    .sort((a, b) => Number(!!b.execucao?.vendaDesfeita) - Number(!!a.execucao?.vendaDesfeita));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Aprovação de Obras</h1>
          <p className="text-sm text-muted-foreground">
            Obras geradas pelas vendas do gerador de propostas e pelo cadastro de proprietários.
            Para aceitar, informe o valor que a equipe cobrou pela execução — ele não pode passar
            do máximo da venda.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, cliente, local…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {obras.length === 0
              ? "Nenhuma obra aguardando aprovação."
              : "Nenhuma obra encontrada para esta busca."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((obra) => {
            const exec = obra.execucao;
            const teto = exec?.teto ?? null;
            const valor = lerValor(valores[obra.id] ?? "");
            const acimaDoTeto = valor != null && teto != null && valor > teto;
            const aguardandoAdmin = exec?.aguardandoAdmin ?? false;
            const unidade = exec?.unidade ? ROTULO_UNIDADE[exec.unidade] : null;
            const desfeita = exec?.vendaDesfeita ?? null;
            const textoDesfeita = desfeita
              ? (VENDA_DESFEITA[desfeita.motivo ?? ""] ?? VENDA_DESFEITA.PROPOSTA_EXCLUIDA)
              : null;
            return (
            <Card
              key={obra.id}
              className={desfeita ? "border-2 border-red-600 bg-red-50/60 dark:bg-red-950/30" : undefined}
            >
              <CardContent className="space-y-3 p-4">
                {desfeita && textoDesfeita && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md bg-red-600 px-3 py-2 text-sm text-white"
                  >
                    <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong className="font-bold uppercase tracking-wide">
                        {textoDesfeita.titulo} em {formatDate(desfeita.em)}
                      </strong>
                      {" — "}
                      {textoDesfeita.texto} Confirme com o vendedor antes de mandar a equipe;
                      se o negócio foi mesmo desfeito, recuse a obra.
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{obra.nome}</h3>
                      {desfeita ? (
                        <Badge variant="destructive">{textoDesfeita?.titulo}</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {obra.cliente && <span>Cliente: {obra.cliente}</span>}
                      {obra.local && <span> · Local: {obra.local}</span>}
                      {exec?.numeroProposta && <span> · Proposta {exec.numeroProposta}</span>}
                      <span> · Criada em {formatDate(obra.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium" htmlFor={`valor-${obra.id}`}>
                      Valor cobrado pela equipe (R$)
                    </label>
                    <Input
                      id={`valor-${obra.id}`}
                      inputMode="decimal"
                      className={`h-9 w-40 ${acimaDoTeto ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                      placeholder="0,00"
                      value={valores[obra.id] ?? ""}
                      onChange={(e) =>
                        setValores((prev) => ({ ...prev, [obra.id]: e.target.value }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {exec?.autorizado ? (
                        <>
                          Máximo autorizado:{" "}
                          <strong className="text-foreground">
                            {formatarReais(exec.autorizado.valor)}
                          </strong>
                          {exec.autorizado.por && <> por {exec.autorizado.por}</>}
                          {exec.autorizado.motivo && <> — {exec.autorizado.motivo}</>}
                          {exec.tetoCalculado != null && (
                            <> (pela regra seria {formatarReais(exec.tetoCalculado)})</>
                          )}
                        </>
                      ) : aguardandoAdmin && unidade ? (
                        <span className="font-medium text-amber-700">
                          Projeto grande ({exec!.quantidade!.toLocaleString("pt-BR")}{" "}
                          {unidade.plural}, acima de{" "}
                          {exec!.limiteQtdAutomatico!.toLocaleString("pt-BR")}): negociado à
                          parte. Aguardando o administrador definir o máximo.
                        </span>
                      ) : teto != null && exec?.quantidade != null && unidade && exec.valorUnitario != null ? (
                        <>
                          Máximo: <strong className="text-foreground">{formatarReais(teto)}</strong>{" "}
                          ({exec.quantidade.toLocaleString("pt-BR")}{" "}
                          {exec.quantidade === 1 ? unidade.singular : unidade.plural}
                          {exec.tetoPeloMinimo
                            ? " — valor mínimo da obra"
                            : ` × ${formatarReais(exec.valorUnitario)}`}
                          )
                        </>
                      ) : (
                        "Sem valor máximo definido para esta obra."
                      )}
                    </p>
                    {acimaDoTeto && (
                      <p className="text-xs font-medium text-red-600">
                        Acima do máximo em {formatarReais(valor! - teto!)}. Negocie com a equipe
                        ou peça ao administrador um máximo maior.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={acting === obra.id}
                      onClick={() => decidir(obra.id, "RECUSADA")}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Recusar
                    </Button>
                    <Button
                      size="sm"
                      disabled={acting === obra.id || valor == null || acimaDoTeto || aguardandoAdmin}
                      title={
                        aguardandoAdmin
                          ? "Aguardando o administrador definir o máximo"
                          : valor == null
                            ? "Informe o valor cobrado pela equipe"
                            : undefined
                      }
                      onClick={() => decidir(obra.id, "ACEITA")}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Aceitar
                    </Button>
                  </div>
                </div>

                {obra.podeAutorizar && (
                  <AutorizarTeto
                    obraId={obra.id}
                    autorizadoAtual={exec?.autorizado?.valor ?? null}
                    onSalvo={carregar}
                  />
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
