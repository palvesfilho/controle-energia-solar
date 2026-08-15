"use client";

/**
 * UCs assinadas no CRM, esperando cadastro aqui.
 *
 * É a tela que o operador usa de verdade: a UC é o que vai ser interligado com
 * a usina, então a linha é a UC — não a proposta. Cada card traz o kWh que foi
 * assinado para AQUELA UC, os dados do consumidor como constam no termo, e os
 * documentos do cliente, para o cadastro não ser redigitado.
 *
 * A fatura de energia não aparece de propósito: o que o Gestor precisa é do
 * número da UC, que já vem no termo. O PDF da fatura serve à conferência de
 * comissão do vendedor e fica no CRM.
 *
 * A BUSCA vem de fora, do topo da tela (ver [[fila-crm]]): esta lista tinha um
 * campo próprio, e com dois campos na mesma página o de cima — o que parece ser
 * "a busca da tela" — não mexia nesta lista. Agora é um só. E, com termo
 * digitado, a busca ignora a aba aberta e varre as quatro: procurar uma UC que
 * já foi cadastrada devolvia "nada aqui" só porque a aba era outra.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Plug,
  Check,
  X,
  FileText,
  FileSignature,
  Mail,
  Phone,
  MapPin,
  UserRound,
  Zap,
  CircleCheck,
  TriangleAlert,
  Undo2,
  UserPlus,
  Factory,
  Clock,
} from "lucide-react";
import { matchBusca } from "@/lib/busca";
import { formatCpfCnpjComRotulo } from "@/lib/documento";

interface DocumentoCrm {
  id: number;
  categoria: string | null;
  nomeArquivo: string;
  tamanho: number | null;
  mime: string | null;
}

interface UcAssinada {
  id: string;
  propostaIdCrm: number;
  adesaoIdCrm: number;
  codigoUc: string;
  codigoUcBruto: string | null;
  mediaMensalKwh: number | null;
  clienteNome: string;
  clienteDocumento: string | null;
  clienteTipo: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  representanteNome: string | null;
  representanteCpf: string | null;
  representanteCargo: string | null;
  concessionaria: string | null;
  proprietarioUsina: boolean;
  assinaturaStatus: string | null;
  assinadoEm: string | null;
  envelopeIdCrm: string | null;
  situacao: string;
  vendaGanha: boolean;
  statusNegocio: string | null;
  documentos: DocumentoCrm[];
  jaCadastrada: { id: string; codigoUc: string; nome: string } | null;
}

/** Em qual aba a UC cai, dados os dois eixos. */
function abaDe(situacao: string, vendaGanha: boolean): Aba {
  if (situacao === "CONCLUIDA") return "CONCLUIDA";
  if (situacao === "IGNORADA") return "IGNORADA";
  return vendaGanha ? "PENDENTE" : "SEM_VENDA";
}

const ROTULO_CATEGORIA: Record<string, string> = {
  identidade: "Identidade",
  cartao_cnpj: "Cartão CNPJ",
  contrato_social: "Contrato social",
  outros: "Outro",
};

/**
 * As quatro abas, sobre DOIS eixos: `situacao` é do operador, `vendaGanha` é do
 * CRM. Sem "Cadastradas" e "Ignoradas" visíveis, um clique errado em "Já
 * cadastrei" faz a UC sumir sem lugar nenhum para procurá-la — os dados
 * continuariam no banco, mas fora de alcance de quem usa a tela.
 */
const ABAS = [
  { chave: "PENDENTE", rotulo: "A cadastrar", situacao: "PENDENTE", vendaGanha: "true" },
  // Termo assinado, venda ainda em negociação no CRM. Fica FORA de "A
  // cadastrar" porque não é trabalho — é espera. Mas não pode sumir: se o
  // vendedor esqueceu de marcar a venda, alguém precisa enxergar.
  {
    chave: "SEM_VENDA",
    rotulo: "Sem venda fechada",
    situacao: "PENDENTE",
    vendaGanha: "false",
  },
  { chave: "CONCLUIDA", rotulo: "Cadastradas", situacao: "CONCLUIDA", vendaGanha: "" },
  { chave: "IGNORADA", rotulo: "Ignoradas", situacao: "IGNORADA", vendaGanha: "" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatarTelefone(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

function formatarCep(c: string | null): string {
  if (!c) return "";
  const d = c.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : c;
}

function enderecoCompleto(u: UcAssinada): string {
  const linha = [u.logradouro, u.numero, u.complemento].filter(Boolean).join(", ");
  const local = [u.bairro, u.cidade].filter(Boolean).join(" · ");
  const cep = formatarCep(u.cep);
  return [linha, local, cep].filter(Boolean).join(" — ");
}

export function UcsAssinadasCrm({ search = "" }: { search?: string }) {
  const [ucs, setUcs] = useState<UcAssinada[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("PENDENTE");

  /**
   * Carrega as QUATRO abas de uma vez e divide aqui. São dezenas de linhas, não
   * milhares — e é o que permite a busca achar em aba fechada. Buscar só dentro
   * da aba aberta é o que fazia a busca parecer morta.
   */
  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/crm/ucs?situacao=TODAS`)
      .then(async (res) => {
        const texto = await res.text();
        let corpo: { ucs?: UcAssinada[]; avisoDocumentos?: string; error?: string; hint?: string } = {};
        try {
          corpo = JSON.parse(texto);
        } catch {
          throw new Error(`HTTP ${res.status}: ${texto.slice(0, 200) || "(resposta vazia)"}`);
        }
        if (!res.ok) {
          throw new Error([corpo.error, corpo.hint].filter(Boolean).join(" — ") || `HTTP ${res.status}`);
        }
        return corpo;
      })
      .then((corpo) => {
        setUcs(Array.isArray(corpo.ucs) ? corpo.ucs : []);
        setAviso(corpo.avisoDocumentos ?? null);
      })
      .catch((err: Error) => {
        console.error("Erro ao carregar UCs do CRM:", err);
        toast.error(`Erro ao carregar as UCs: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /**
   * Move a UC entre as abas. `avisar` desligado no desfazer, para o toast do
   * desfazer não empilhar em cima do toast que o ofereceu.
   */
  const mover = useCallback(
    async (uc: UcAssinada, situacao: "PENDENTE" | "CONCLUIDA" | "IGNORADA", avisar = true) => {
      setActing(uc.id);
      try {
        const res = await fetch(`/api/crm/ucs/${uc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ situacao }),
        });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);

        // Muda a situação em vez de tirar da lista: a linha continua carregada
        // e some só da aba de origem. Removê-la faria a UC desaparecer também
        // da aba de destino até o próximo F5 — e da busca.
        const para = abaDe(situacao, uc.vendaGanha);
        setUcs((prev) => prev.map((x) => (x.id === uc.id ? { ...x, situacao } : x)));

        if (avisar) {
          const rotulo = ABAS.find((a) => a.chave === para)?.rotulo ?? situacao;
          const anterior = uc.situacao as "PENDENTE" | "CONCLUIDA" | "IGNORADA";
          toast.success(`${uc.codigoUcBruto || uc.codigoUc} → ${rotulo}.`, {
            action: {
              label: "Desfazer",
              onClick: () => void mover({ ...uc, situacao }, anterior, false),
            },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Falha ao atualizar: ${msg}`);
      } finally {
        setActing(null);
      }
    },
    [],
  );

  /**
   * "Já cadastrei": a UC existe aqui de antes. Vincula e copia os documentos
   * da adesão para dentro dela. Só aparece quando o código casou com uma UC
   * cadastrada — sem isso, alguém marcaria como feita uma UC inexistente.
   */
  async function jaCadastrei(uc: UcAssinada) {
    if (!uc.jaCadastrada) return;
    setActing(uc.id);
    try {
      const res = await fetch(`/api/crm/ucs/${uc.id}/vincular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerUnitId: uc.jaCadastrada.id }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);

      const d = dados.documentos ?? {};
      const guardados = (d.copiados?.length ?? 0) + (d.reaproveitados?.length ?? 0);
      toast.success(
        `${uc.codigoUcBruto || uc.codigoUc} vinculada · ${guardados} documento(s) guardados na UC.`,
      );
      // Anexo que não veio precisa aparecer: em silêncio, a UC fica com meia
      // papelada e ninguém descobre até precisar dela.
      if (d.falhas?.length) {
        toast.warning(`Não copiados: ${d.falhas.join(" · ")}`);
      }
      setUcs((prev) =>
        prev.map((x) => (x.id === uc.id ? { ...x, situacao: "CONCLUIDA" } : x)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Falha ao vincular: ${msg}`);
    } finally {
      setActing(null);
    }
  }

  const buscando = search.trim() !== "";

  const casaBusca = (u: UcAssinada) =>
    matchBusca(search, [
      u.codigoUc,
      u.codigoUcBruto,
      u.clienteNome,
      u.clienteDocumento,
      u.clienteEmail,
      u.cidade,
      u.bairro,
      u.logradouro,
      u.representanteNome,
      u.concessionaria,
    ]);

  const achadas = ucs.filter(casaBusca);
  // Com termo digitado a aba deixa de filtrar: quem procura um cliente quer
  // achá-lo mesmo que ele já tenha sido cadastrado ou ignorado. Cada card
  // mostra a aba a que pertence, então não se perde de vista o estado dele.
  const filtradas = buscando
    ? achadas
    : achadas.filter((u) => abaDe(u.situacao, u.vendaGanha) === aba);

  // Contagem sempre sobre a lista inteira — a aba mostra quantas existem, não
  // quantas sobraram do filtro.
  const contagens = ABAS.reduce(
    (acc, a) => {
      acc[a.chave] = ucs.filter((u) => abaDe(u.situacao, u.vendaGanha) === a.chave).length;
      return acc;
    },
    {} as Record<Aba, number>,
  );

  const totalKwh = filtradas.reduce((s, u) => s + (u.mediaMensalKwh ?? 0), 0);
  const semKwh = filtradas.filter((u) => u.mediaMensalKwh == null).length;

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
          <Plug className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            UCs assinadas no CRM
            <Badge variant="outline">{filtradas.length}</Badge>
            {totalKwh > 0 && (
              <Badge variant="secondary">
                {totalKwh.toLocaleString("pt-BR")} kWh/mês
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Cada linha é uma unidade consumidora do Termo de Adesão, com o consumo
            assinado para ela e os documentos do cliente. É a UC que se interliga com a
            usina. A fatura de energia fica no CRM — aqui basta o número da UC.
          </p>
        </div>
      </div>

      {/* Buscando, as abas param de recortar a lista — ficam desbotadas para
          deixar isso explícito, em vez de a aba marcada mentir sobre o que
          está na tela. */}
      <div className={cn("flex flex-wrap gap-1 border-b", buscando && "opacity-60")}>
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              aba === a.chave && !buscando
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.rotulo}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {buscando
                ? achadas.filter((u) => abaDe(u.situacao, u.vendaGanha) === a.chave).length
                : contagens[a.chave]}
            </span>
          </button>
        ))}
      </div>

      {buscando && (
        <p className="text-xs text-muted-foreground">
          Busca ativa: mostrando as {filtradas.length} UC(s) que casam em <b>todas</b> as
          abas. Limpe a busca para voltar a ver só a aba aberta.
        </p>
      )}

      {semKwh > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              {semKwh} UC(s) sem consumo assinado. O CRM não trouxe a média dessas — o
              campo fica em branco em vez de receber um número chutado, porque kWh errado
              vira dimensionamento errado da usina.
            </span>
          </CardContent>
        </Card>
      )}

      {aviso && (
        <Card className="border-amber-500/40">
          <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>As UCs carregaram, mas os documentos não: {aviso}</span>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {buscando
              ? `Nenhuma UC do CRM casa com "${search}" — em nenhuma das abas.`
              : aba === "PENDENTE"
                ? "Nenhuma UC assinada esperando cadastro."
                : aba === "SEM_VENDA"
                  ? "Nenhuma adesão assinada com a venda em aberto."
                  : aba === "CONCLUIDA"
                    ? "Nenhuma UC cadastrada a partir do CRM ainda."
                    : "Nenhuma UC ignorada."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtradas.map((u) => {
            // A aba é do CARD, não a selecionada: buscando, a lista mistura as
            // quatro, e os botões precisam ser os do estado daquela UC.
            const abaDoCard = abaDe(u.situacao, u.vendaGanha);
            return (
            <Card key={u.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-semibold">
                        {u.codigoUcBruto || u.codigoUc}
                      </span>
                      {buscando && (
                        <Badge variant="outline">
                          {ABAS.find((a) => a.chave === abaDoCard)?.rotulo}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="gap-1">
                        <Zap className="h-3 w-3" />
                        {u.mediaMensalKwh != null
                          ? `${u.mediaMensalKwh.toLocaleString("pt-BR")} kWh/mês`
                          : "consumo não informado"}
                      </Badge>
                      {u.concessionaria && <Badge variant="outline">{u.concessionaria}</Badge>}
                      {u.proprietarioUsina && (
                        <Badge variant="outline" className="gap-1 border-amber-500/50">
                          <Factory className="h-3 w-3 text-amber-500" />
                          proprietário de usina
                        </Badge>
                      )}
                      {!u.vendaGanha && (
                        <Badge variant="outline" className="gap-1 border-amber-500/50">
                          <Clock className="h-3 w-3 text-amber-500" />
                          {u.statusNegocio ?? "sem venda fechada"}
                        </Badge>
                      )}
                      {u.jaCadastrada && (
                        <Badge variant="outline" className="gap-1 border-emerald-500/50">
                          <CircleCheck className="h-3 w-3 text-emerald-500" />
                          já cadastrada aqui
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm font-medium">{u.clienteNome}</div>

                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <div>
                        {formatCpfCnpjComRotulo(u.clienteDocumento)}
                        {u.clienteTipo && <span> · {u.clienteTipo}</span>}
                      </div>
                      {(u.clienteEmail || u.clienteTelefone) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {u.clienteEmail && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {u.clienteEmail}
                            </span>
                          )}
                          {u.clienteTelefone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {formatarTelefone(u.clienteTelefone)}
                            </span>
                          )}
                        </div>
                      )}
                      {enderecoCompleto(u) && (
                        <div className="inline-flex items-start gap-1">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{enderecoCompleto(u)}</span>
                        </div>
                      )}
                      {u.representanteNome && (
                        <div className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" />
                          {u.representanteNome}
                          {u.representanteCargo && <span> · {u.representanteCargo}</span>}
                          {u.representanteCpf && (
                            <span> · {formatCpfCnpjComRotulo(u.representanteCpf)}</span>
                          )}
                        </div>
                      )}
                      <div>
                        Proposta {u.propostaIdCrm} · adesão {u.adesaoIdCrm} · assinada em{" "}
                        {formatarData(u.assinadoEm)}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Sem venda fechada não é trabalho, é espera: só dá para
                        ignorar. Cadastrar aqui seria cadastrar um negócio que
                        ainda pode não acontecer. */}
                    {abaDoCard === "SEM_VENDA" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === u.id}
                        onClick={() => void mover(u, "IGNORADA")}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Ignorar
                      </Button>
                    ) : abaDoCard === "PENDENTE" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === u.id}
                          onClick={() => void mover(u, "IGNORADA")}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Ignorar
                        </Button>
                        {/* Só existe quando o código casou com uma UC daqui.
                            Sem o casamento, "já cadastrei" seria palavra sem
                            prova — e a UC sairia da fila sem existir. */}
                        {u.jaCadastrada && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === u.id}
                            onClick={() => void jaCadastrei(u)}
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Já cadastrei
                          </Button>
                        )}
                        {/* Proprietário de usina NÃO é consumidor: quem cede o
                            telhado entra como investidor, com a usina dele. A
                            adesão traz essa marca do CRM (`proprietario_usina`),
                            então o botão muda de destino em vez de mandar todo
                            mundo para o cadastro de UC. */}
                        {u.proprietarioUsina ? (
                          <Link
                            href={`/admin/investidores/novo?crmUc=${u.id}`}
                            className={cn(buttonVariants({ size: "sm" }))}
                          >
                            <Factory className="mr-1 h-4 w-4" />
                            Cadastrar proprietário
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/unidades-consumidoras/nova?crmUc=${u.id}`}
                            className={cn(buttonVariants({ size: "sm" }))}
                          >
                            <UserPlus className="mr-1 h-4 w-4" />
                            Cadastrar UC
                          </Link>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting === u.id}
                        onClick={() => void mover(u, "PENDENTE")}
                      >
                        <Undo2 className="mr-1 h-4 w-4" />
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {/* O envelope guarda DOIS PDFs assinados, termo e procuração.
                      O card só mostrava o termo — a procuração existia na rota
                      e na cópia, mas não tinha por onde ser aberta aqui. */}
                  {u.envelopeIdCrm && (
                    <>
                      <a
                        href={`/api/crm/termo/${u.envelopeIdCrm}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                      >
                        <FileSignature className="h-3 w-3" />
                        Termo assinado
                      </a>
                      <a
                        href={`/api/crm/termo/${u.envelopeIdCrm}?tipo=procuracao`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                      >
                        <FileSignature className="h-3 w-3" />
                        Procuração
                      </a>
                    </>
                  )}
                  {u.documentos.map((d) => (
                    <a
                      key={d.id}
                      href={`/api/crm/documento/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={d.nomeArquivo}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                    >
                      <FileText className="h-3 w-3" />
                      {ROTULO_CATEGORIA[d.categoria ?? ""] ?? d.categoria ?? "Documento"}
                      {d.tamanho ? (
                        <span className="text-muted-foreground">
                          {formatarTamanho(d.tamanho)}
                        </span>
                      ) : null}
                    </a>
                  ))}
                  {!u.envelopeIdCrm && u.documentos.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Sem documentos anexados no CRM.
                    </span>
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
}
