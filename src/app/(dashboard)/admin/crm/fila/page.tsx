"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Inbox,
  Search,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  FileSignature,
  HelpCircle,
} from "lucide-react";
import { matchBusca } from "@/lib/busca";

interface ItemFila {
  id: string;
  propostaIdCrm: number;
  numeroProposta: string | null;
  codigoProduto: string;
  nomeProduto: string;
  clienteNome: string;
  clienteDocumento: string | null;
  cidade: string | null;
  vendedorEmail: string | null;
  valorInvestimento: number | null;
  fechadoEm: string | null;
  statusNegocio: string;
  adesaoIdCrm: number | null;
  concessionaria: string | null;
  codigosUc: string | null;
  mediaMensalKwh: number | null;
  situacao: string;
  obraId: string | null;
}

const CAIXAS = [
  {
    chave: "PENDENTE",
    titulo: "A cadastrar",
    descricao:
      "Venda ganha que precisa de cadastro aqui: unidade consumidora, usina ou plano de monitoramento, e o ajuste do balanço de créditos.",
    icone: Inbox,
    cor: "from-teal-500 to-emerald-600",
  },
  {
    chave: "ASSINADA_SEM_VENDA",
    titulo: "Assinadas sem venda ganha",
    descricao:
      "Termo de Adesão já assinado, mas a proposta continua em negociação no CRM. Ou o vendedor esqueceu de marcar a venda, ou o negócio não fechou — não podem sumir enquanto ninguém decide.",
    icone: FileSignature,
    cor: "from-amber-500 to-orange-600",
  },
  {
    chave: "NAO_CLASSIFICADO",
    titulo: "Produto sem de-para",
    descricao:
      "Produto novo no CRM que ainda não tem destino definido. Nada foi descartado — defina o destino na tela de produtos para ele entrar no fluxo.",
    icone: HelpCircle,
    cor: "from-slate-500 to-slate-700",
  },
] as const;

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function formatarValor(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDocumento(doc: string | null): string {
  if (!doc) return "sem documento";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

export default function FilaCrmPage() {
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/crm/fila")
      .then(async (res) => {
        if (!res.ok) {
          const texto = await res.text();
          let detalhe = texto.slice(0, 300) || "(resposta vazia)";
          try {
            const j = JSON.parse(texto);
            detalhe = [j.error, j.hint].filter(Boolean).join(" — ") || detalhe;
          } catch {}
          throw new Error(`HTTP ${res.status}: ${detalhe}`);
        }
        return res.json();
      })
      .then((data) => setItens(Array.isArray(data) ? data : []))
      .catch((err: Error) => {
        console.error("Erro ao carregar fila do CRM:", err);
        toast.error(`Erro ao carregar a fila: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const res = await fetch("/api/crm/sync", { method: "POST" });
      const dados = await res.json();
      if (!res.ok) {
        throw new Error([dados.error, dados.hint].filter(Boolean).join(" — "));
      }
      toast.success(
        `Sincronizado: ${dados.vendasGanhas} venda(s) ganha(s) lida(s), ${dados.obrasCriadas} obra(s) criada(s).`,
      );
      if (Array.isArray(dados.naoClassificados) && dados.naoClassificados.length > 0) {
        toast.warning(`${dados.naoClassificados.length} produto(s) sem de-para definido.`);
      }
      carregar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao sincronizar: ${msg}`);
    } finally {
      setSincronizando(false);
    }
  }

  async function decidir(item: ItemFila, situacao: "CONCLUIDA" | "IGNORADA") {
    setActing(item.id);
    try {
      const res = await fetch(`/api/crm/fila/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      toast.success(
        situacao === "CONCLUIDA" ? "Marcada como cadastrada." : "Item ignorado.",
      );
      setItens((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setActing(null);
    }
  }

  const filtrados = itens.filter((i) =>
    matchBusca(search, [
      i.clienteNome,
      i.nomeProduto,
      i.clienteDocumento,
      i.codigosUc,
      i.cidade,
      i.numeroProposta,
    ]),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Vendas vindas do CRM</h1>
            <p className="text-sm text-muted-foreground">
              Vendas ganhas no gerador de propostas que precisam de cadastro na gestão.
              As que geram obra vão direto para a aprovação de obras.
            </p>
          </div>
        </div>
        <Button onClick={sincronizar} disabled={sincronizando} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente, produto, UC, documento…"
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
      ) : (
        CAIXAS.map((caixa) => {
          const daCaixa = filtrados.filter((i) => i.situacao === caixa.chave);
          const Icone = caixa.icone;
          return (
            <section key={caixa.chave} className="space-y-3">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${caixa.cor} text-white`}
                >
                  <Icone className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {caixa.titulo}
                    <Badge variant="outline">{daCaixa.length}</Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">{caixa.descricao}</p>
                </div>
              </div>

              {daCaixa.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    Nada aqui.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {daCaixa.map((item) => {
                    const ucs = item.codigosUc ? item.codigosUc.split(",") : [];
                    return (
                      <Card key={item.id}>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="truncate font-semibold">{item.clienteNome}</h3>
                                <Badge variant="secondary">{item.nomeProduto}</Badge>
                                {item.obraId && <Badge variant="outline">obra criada</Badge>}
                                {item.situacao === "ASSINADA_SEM_VENDA" && (
                                  <Badge variant="outline" className="gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {item.statusNegocio}
                                  </Badge>
                                )}
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {formatarDocumento(item.clienteDocumento)}
                                {item.cidade && <span> · {item.cidade}</span>}
                                {item.concessionaria && <span> · {item.concessionaria}</span>}
                                <span> · Proposta {item.numeroProposta ?? item.propostaIdCrm}</span>
                                <span> · Fechada em {formatarData(item.fechadoEm)}</span>
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {ucs.length > 0 ? (
                                  <span>
                                    {ucs.length} UC(s): <span className="font-mono">{ucs.join(", ")}</span>
                                  </span>
                                ) : (
                                  <span>sem UC informada na adesão</span>
                                )}
                                {item.mediaMensalKwh != null && (
                                  <span> · média {item.mediaMensalKwh} kWh/mês</span>
                                )}
                                <span> · {formatarValor(item.valorInvestimento)}</span>
                                {item.vendedorEmail && <span> · {item.vendedorEmail}</span>}
                              </div>
                            </div>

                            {caixa.chave !== "NAO_CLASSIFICADO" && (
                              <div className="flex shrink-0 items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={acting === item.id}
                                  onClick={() => decidir(item, "IGNORADA")}
                                >
                                  <X className="mr-1 h-4 w-4" />
                                  Ignorar
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={acting === item.id}
                                  onClick={() => decidir(item, "CONCLUIDA")}
                                >
                                  <Check className="mr-1 h-4 w-4" />
                                  Já cadastrei
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
