"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2, Search, Save } from "lucide-react";
import { matchBusca } from "@/lib/busca";

interface ProdutoDestino {
  id: string;
  codigoProduto: string;
  nomeProduto: string;
  geraObra: boolean;
  tipoObra: string | null;
  destinoGestao: string;
  ativo: boolean;
}

const DESTINOS: { valor: string; rotulo: string }[] = [
  { valor: "NENHUM", rotulo: "Não entra no Gestor" },
  { valor: "ADESAO", rotulo: "Adesão (UC + créditos)" },
  { valor: "USINA_UC", rotulo: "Usina + UC" },
  { valor: "MONITORAMENTO", rotulo: "Plano de monitoramento" },
];

const TIPOS_OBRA: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Não gera obra" },
  { valor: "INSTALACAO", rotulo: "Obra — instalação" },
  { valor: "MANUTENCAO", rotulo: "Obra — manutenção" },
];

export default function ProdutosCrmPage() {
  const [produtos, setProdutos] = useState<ProdutoDestino[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/crm/produtos-destino")
      .then(async (res) => {
        if (!res.ok) {
          const texto = await res.text();
          throw new Error(`HTTP ${res.status}: ${texto.slice(0, 300)}`);
        }
        return res.json();
      })
      .then((data) => setProdutos(Array.isArray(data) ? data : []))
      .catch((err: Error) => toast.error(`Erro ao carregar produtos: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alterar(codigo: string, campos: Partial<ProdutoDestino>) {
    setProdutos((prev) =>
      prev.map((p) => (p.codigoProduto === codigo ? { ...p, ...campos } : p)),
    );
  }

  async function salvar(produto: ProdutoDestino) {
    setSalvando(produto.codigoProduto);
    try {
      const res = await fetch("/api/crm/produtos-destino", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoProduto: produto.codigoProduto,
          nomeProduto: produto.nomeProduto,
          geraObra: produto.geraObra,
          tipoObra: produto.tipoObra,
          destinoGestao: produto.destinoGestao,
          ativo: produto.ativo,
        }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      toast.success(`${produto.nomeProduto} salvo.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao salvar: ${msg}`);
    } finally {
      setSalvando(null);
    }
  }

  const filtrados = produtos.filter((p) =>
    matchBusca(search, [p.nomeProduto, p.codigoProduto]),
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 text-white">
          <Settings2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Produtos do CRM</h1>
          <p className="text-sm text-muted-foreground">
            Define o que cada produto vendido no gerador de propostas gera aqui. Produto
            sem destino definido não some — fica na caixa de não classificados da fila.
          </p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar produto…"
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
        <div className="grid gap-3">
          {filtrados.map((produto) => (
            <Card key={produto.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{produto.nomeProduto}</h3>
                      {!produto.ativo && <Badge variant="outline">inativo</Badge>}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {produto.codigoProduto}
                    </code>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={produto.geraObra ? produto.tipoObra ?? "INSTALACAO" : ""}
                      onChange={(e) =>
                        alterar(produto.codigoProduto, {
                          geraObra: e.target.value !== "",
                          tipoObra: e.target.value || null,
                        })
                      }
                    >
                      {TIPOS_OBRA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>

                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={produto.destinoGestao}
                      onChange={(e) =>
                        alterar(produto.codigoProduto, { destinoGestao: e.target.value })
                      }
                    >
                      {DESTINOS.map((d) => (
                        <option key={d.valor} value={d.valor}>
                          {d.rotulo}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      disabled={salvando === produto.codigoProduto}
                      onClick={() => salvar(produto)}
                    >
                      <Save className="mr-1 h-4 w-4" />
                      Salvar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
