"use client";

/**
 * Fila de vendas do CRM, compartilhada pelos dois módulos do AURA.
 *
 * A mesma tela serve a Associação de Energia e a Brasil Solar; o que muda é o
 * `modulo`, que vai como filtro para a API e troca os textos. A divisão em si
 * mora em [[crm-modulo]] — aqui não se decide nada, só se pede filtrado.
 *
 * Por que duas rotas em vez de uma com querystring: o AURA descobre o módulo
 * pelo PATH (`detectAdminModule`). Uma rota só faria o sidebar da Brasil Solar
 * pular para o da Associação no clique.
 *
 * BUSCA (corrigida em 15/08/2026): é uma só, aqui no topo, e vale para a tela
 * inteira — inclusive para a lista de UCs assinadas, que tinha campo próprio.
 * Eram dois campos: o de cima, que parece ser "a busca da tela", não mexia na
 * lista de baixo. E ela só enxergava a fila de pendências: procurar um cliente
 * já cadastrado não devolvia nada, porque a API nem trazia os resolvidos. Agora
 * a tela carrega TODAS as situações e a busca varre tudo.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Inbox,
  Search,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  FileSignature,
  HelpCircle,
  HardHat,
  CheckCheck,
  Undo2,
} from "lucide-react";
import { matchBusca } from "@/lib/busca";
import { formatCpfCnpjComRotulo } from "@/lib/documento";
import type { ModuloCrm } from "@/lib/crm-modulo";
import { UcsAssinadasCrm } from "@/components/crm/ucs-assinadas-crm";
import { AvisoPrimeiraAutorizacao } from "@/components/crm/aviso-primeira-autorizacao";

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
  /** Nome completo de quem fechou o negócio, de `usuarios.nome` no CRM. */
  vendedorNome: string | null;
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

const TEXTOS: Record<
  ModuloCrm,
  { titulo: string; subtitulo: string; pendente: string }
> = {
  assoc: {
    titulo: "Vendas do CRM — Associação de Energia",
    subtitulo:
      "Adesões assinadas de desconto na fatura, vindas do gerador de propostas. Obra e plano de monitoramento aparecem no módulo Brasil Solar.",
    pendente:
      "Adesão assinada que precisa de cadastro aqui: unidade consumidora, usina quando o cliente cede o telhado, e o ajuste do balanço de créditos.",
  },
  bs: {
    titulo: "Vendas do CRM — Brasil Solar",
    subtitulo:
      "Plano de monitoramento vindo do gerador de propostas. As adesões de desconto na fatura aparecem no módulo Associação de Energia.",
    pendente:
      "Venda ganha que precisa de cadastro na rede Brasil Solar — hoje, o plano de monitoramento da planta.",
  },
};

const CAIXAS = [
  {
    chave: "PENDENTE",
    titulo: "A cadastrar",
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
      "Produto novo no CRM que ainda não tem destino definido. Aparece nos dois módulos de propósito, porque ainda não dá para saber de quem é. Defina o destino na tela de produtos para ele entrar no fluxo.",
    icone: HelpCircle,
    cor: "from-slate-500 to-slate-700",
  },
] as const;

/**
 * Caixa que só aparece com busca ativa: as vendas que já saíram da fila
 * (cadastradas ou ignoradas). Fora da busca ela não existe, para a tela
 * continuar sendo a lista do que falta fazer.
 */
const CAIXA_RESOLVIDAS = {
  chave: "RESOLVIDAS",
  titulo: "Já resolvidas",
  descricao:
    "Vendas que já foram cadastradas ou ignoradas. Aparecem porque a busca está ativa — é onde o cliente que você procura costuma estar quando some da fila.",
  icone: CheckCheck,
  cor: "from-sky-500 to-indigo-600",
} as const;

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function formatarValor(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// A máscara vive em `@/lib/documento` desde 15/08/2026 — esta cópia local era a
// única formatação de documento do sistema, enquanto ~15 outras telas mostravam
// CPF/CNPJ crus. Mantida só como alias pra não espalhar a troca de nome aqui.
const formatarDocumento = (doc: string | null) => formatCpfCnpjComRotulo(doc);

export function FilaCrm({ modulo }: { modulo: ModuloCrm }) {
  const [itens, setItens] = useState<ItemFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [versaoUcs, setVersaoUcs] = useState(0);
  const [agenda, setAgenda] = useState<AgendaSync | null>(null);

  const textos = TEXTOS[modulo];

  // `situacao=TODAS`: as caixas continuam mostrando só o que exige atenção, mas
  // as vendas já cadastradas/ignoradas ficam carregadas para a busca alcançar.
  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/fila?modulo=${modulo}&situacao=TODAS`)
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
  }, [modulo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Estado do agendador. Falha aqui é irrelevante para a tela: o aviso some,
  // a fila continua.
  const carregarAgenda = useCallback(() => {
    fetch("/api/crm/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAgenda(d))
      .catch(() => setAgenda(null));
  }, []);

  useEffect(() => {
    carregarAgenda();
  }, [carregarAgenda]);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const res = await fetch("/api/crm/sync", { method: "POST" });
      const dados = await res.json();
      if (!res.ok) {
        throw new Error([dados.error, dados.hint].filter(Boolean).join(" — "));
      }
      const ucs = (dados.ucsNovas ?? 0) + (dados.ucsAtualizadas ?? 0);
      toast.success(
        `Sincronizado: ${dados.vendasGanhas} venda(s) ganha(s), ${ucs} UC(s) assinada(s), ` +
          `${dados.obrasCriadas} obra(s) criada(s).`,
      );
      if (Array.isArray(dados.naoClassificados) && dados.naoClassificados.length > 0) {
        toast.warning(`${dados.naoClassificados.length} produto(s) sem de-para definido.`);
      }
      if (dados.ucsSemMediaConfiavel > 0) {
        toast.warning(
          `${dados.ucsSemMediaConfiavel} UC(s) sem consumo confiável — ficaram em branco.`,
        );
      }
      carregar();
      carregarAgenda();
      // A lista de UCs tem carregamento próprio; remonta para refletir o sync.
      setVersaoUcs((v) => v + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao sincronizar: ${msg}`);
    } finally {
      setSincronizando(false);
    }
  }

  async function decidir(
    item: ItemFila,
    situacao: "CONCLUIDA" | "IGNORADA" | "PENDENTE",
  ) {
    setActing(item.id);
    try {
      const res = await fetch(`/api/crm/fila/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      toast.success(
        situacao === "CONCLUIDA"
          ? "Marcada como cadastrada."
          : situacao === "IGNORADA"
            ? "Item ignorado."
            : "Item reaberto — voltou para a fila.",
      );
      // Muda a situação em vez de remover: sai das caixas de pendência sozinho,
      // e continua achável pela busca (é justamente o que faltava).
      setItens((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, situacao } : i)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setActing(null);
    }
  }

  const buscando = search.trim() !== "";

  const filtrados = itens.filter((i) =>
    matchBusca(search, [
      i.clienteNome,
      i.nomeProduto,
      i.clienteDocumento,
      i.codigosUc,
      i.cidade,
      i.numeroProposta,
      String(i.propostaIdCrm),
      i.vendedorEmail,
      i.vendedorNome,
    ]),
  );

  // Vendas que já saíram da fila. Só aparecem com busca ativa: sem termo, a
  // tela é a lista de trabalho, não o histórico.
  const resolvidos = filtrados.filter(
    (i) => i.situacao === "CONCLUIDA" || i.situacao === "IGNORADA",
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{textos.titulo}</h1>
            <p className="text-sm text-muted-foreground">{textos.subtitulo}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={sincronizar} disabled={sincronizando} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
            {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
          <AvisoAgenda agenda={agenda} />
        </div>
      </div>

      {/* A autorização de acesso é documento da ADESÃO, que só existe no mundo
          Associação. Na Brasil Solar o card não faria sentido. */}
      {modulo === "assoc" && <AvisoPrimeiraAutorizacao />}

      {/* Venda que gera obra NÃO passa por esta fila: o sync já cria a obra e
          ela cai em Aprovação de Obras. Sem este aviso, a tela vazia da Brasil
          Solar parece defeito. */}
      {modulo === "bs" && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <HardHat className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              Inspeção, fotovoltaica, piso aquecido e demais vendas que geram obra não
              param aqui: o sync já cria a obra e ela vai direto para a aprovação.
            </span>
            <Link
              href="/admin/obra/aprovacao"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              Aprovação de Obras
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Uma busca só para a tela inteira — inclusive para a lista de UCs
          abaixo, que tinha um campo próprio e ficava surda a este. */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente, produto, UC, documento, proposta…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {buscando && (
          <button
            type="button"
            onClick={() => setSearch("")}
            title="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Na Associação o trabalho é por UC, não por proposta: a caixa
          "A cadastrar" vira a lista de UCs assinadas, com kWh e documentos.
          As outras duas caixas continuam por proposta, porque são exceções da
          VENDA (produto sem destino, adesão sem venda ganha) e não de uma UC. */}
      {modulo === "assoc" && <UcsAssinadasCrm key={versaoUcs} search={search} />}

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : (
        [
          ...CAIXAS.filter((c) => !(modulo === "assoc" && c.chave === "PENDENTE")),
          // Caixa que só existe durante a busca: o histórico não é lista de
          // trabalho, mas precisa ser encontrável.
          ...(buscando && resolvidos.length > 0 ? [CAIXA_RESOLVIDAS] : []),
        ].map((caixa) => {
          const daCaixa =
            caixa.chave === "RESOLVIDAS"
              ? resolvidos
              : filtrados.filter((i) => i.situacao === caixa.chave);
          if (buscando && daCaixa.length === 0) return null;
          const Icone = caixa.icone;
          const descricao =
            caixa.chave === "PENDENTE" ? textos.pendente : caixa.descricao;
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
                  <p className="text-xs text-muted-foreground">{descricao}</p>
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
                                {caixa.chave === "RESOLVIDAS" && (
                                  <Badge variant="outline">
                                    {item.situacao === "CONCLUIDA" ? "cadastrada" : "ignorada"}
                                  </Badge>
                                )}
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
                                {/* Nome quando existe; o e-mail vira o título,
                                    para não gastar a linha com o endereço. */}
                                {(item.vendedorNome || item.vendedorEmail) && (
                                  <span title={item.vendedorEmail ?? undefined}>
                                    {" "}
                                    · {item.vendedorNome ?? item.vendedorEmail}
                                  </span>
                                )}
                              </div>
                            </div>

                            {caixa.chave === "RESOLVIDAS" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={acting === item.id}
                                onClick={() => decidir(item, "PENDENTE")}
                              >
                                <Undo2 className="mr-1 h-4 w-4" />
                                Reabrir
                              </Button>
                            ) : caixa.chave !== "NAO_CLASSIFICADO" ? (
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
                            ) : null}
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

      {/* Com busca ativa as caixas vazias somem; sem esta linha, buscar algo
          inexistente deixaria a tela em branco e pareceria a busca travada. */}
      {!loading && buscando && filtrados.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma venda do CRM casa com &ldquo;{search}&rdquo; — nem entre as já
            cadastradas ou ignoradas.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Resposta de `GET /api/crm/sync` — o estado do agendador. */
interface AgendaSync {
  horarios: number[];
  ultimoSlot: string | null;
  ultimoSlotEm: string | null;
  slotDevido: string;
  configurado: boolean;
}

/**
 * Linha abaixo do botão: diz que o sync roda sozinho e quando rodou por último.
 * Existe para o operador não clicar "por via das dúvidas" — e para a falha do
 * agendador aparecer, em vez de virar silêncio (o horário devido fica atrasado
 * e a linha avisa).
 */
function AvisoAgenda({ agenda }: { agenda: AgendaSync | null }) {
  if (!agenda) return null;

  const horarios = agenda.horarios.map((h) => `${h}h`).join(" e ");
  const atrasado = agenda.ultimoSlot !== agenda.slotDevido;

  const quando = agenda.ultimoSlotEm
    ? new Date(agenda.ultimoSlotEm).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <span className={`text-xs ${atrasado ? "text-amber-600" : "text-muted-foreground"}`}>
      Automático às {horarios}
      {quando ? ` · última: ${quando}` : " · ainda não rodou sozinho"}
    </span>
  );
}
