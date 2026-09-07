"use client";

/**
 * O editor de um COMUNICADO: público, recorte, texto, prévia e disparo.
 *
 * 🔑 **O contador do recorte fica sempre à vista.** A pergunta que importa
 * antes de mandar não é "o texto está bom" — é "para quantas pessoas isto vai,
 * e são as certas". Por isso o alcance recarrega a cada mudança de filtro e a
 * amostra mostra os primeiros nomes: reconhecer três clientes na lista é o que
 * revela um recorte errado antes do disparo, não depois.
 *
 * ⚠️ O disparo pede confirmação digitada. Não é cerimônia: manda mensagem para
 * dezenas de clientes reais e não tem desfazer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Loader2,
  Mail,
  MessageSquare,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Publico = "INVESTIDOR" | "CLIENTE_DESCONTO";

const PUBLICO_LABEL: Record<Publico, string> = {
  CLIENTE_DESCONTO: "Clientes com desconto na fatura",
  INVESTIDOR: "Investidores (donos de usina)",
};

export interface Filtro {
  cidades?: string[];
  plantIds?: string[];
  somenteComEmail?: boolean;
  somenteComWhatsapp?: boolean;
  investidorComUsina?: boolean;
  situacao?: "FATURANDO" | "EM_IMPLANTACAO";
}

export type TipoComunicado = "INFORMATIVO" | "ATENCAO" | "URGENTE";

const TIPO_LABEL: Record<TipoComunicado, string> = {
  INFORMATIVO: "Informativo",
  ATENCAO: "Atenção",
  URGENTE: "Urgente",
};

const TIPO_QUANDO: Record<TipoComunicado, string> = {
  INFORMATIVO: "Notícia, novidade, explicação.",
  ATENCAO: "Algo muda para o cliente: reajuste, nova regra, prazo chegando.",
  URGENTE: "Exige ação e tem prazo curto.",
};

/** A cor do botão espelha a do email, para a escolha ser visível na tela. */
const TIPO_COR: Record<TipoComunicado, string> = {
  INFORMATIVO: "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/30 dark:text-teal-200",
  ATENCAO: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
  URGENTE: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200",
};

export type Desenho =
  | "PADRAO"
  | "TIMBRE_LATERAL"
  | "CABECALHO_SOLIDO"
  | "CARTA"
  | "DESTAQUE"
  | "BOTAO"
  | "AVISO_CURTO";

/**
 * Para onde vai o envio de teste, por padrão.
 *
 * 🔑 É o endereço do operador, não um exemplo: o teste existe para a PRIMEIRA
 * execução do disparo acontecer contra quem opera, e não contra a carteira. O
 * campo é editável — quem testar de outra caixa troca aqui.
 */
const EMAIL_TESTE_PADRAO = "palvesfilho@gmail.com";

const DESENHO_LABEL: Record<Desenho, string> = {
  PADRAO: "Padrão",
  TIMBRE_LATERAL: "Timbre lateral",
  CABECALHO_SOLIDO: "Cabeçalho sólido",
  CARTA: "Carta",
  DESTAQUE: "Número em destaque",
  BOTAO: "Com um botão",
  AVISO_CURTO: "Aviso curto",
};

const DESENHO_QUANDO: Record<Desenho, string> = {
  PADRAO: "Faixa da marca no topo. Serve para quase tudo.",
  TIMBRE_LATERAL: "A cor vira barra de canto. Mais discreto.",
  CABECALHO_SOLIDO: "Bloco de cor cheio, marca e título dentro.",
  CARTA: "Sem cor, serifada, assinada. Assunto delicado.",
  DESTAQUE: "Quando uma cifra é a notícia.",
  BOTAO: "Quando o cliente precisa FAZER algo.",
  AVISO_CURTO: "Um recado de uma frase, lido sem rolar.",
};

export interface ComunicadoForm {
  id?: string;
  nome: string;
  tipo: TipoComunicado;
  desenho: Desenho;
  destaqueRotulo: string;
  destaqueValor: string;
  destaqueNota: string;
  botaoTexto: string;
  botaoUrl: string;
  botaoNota: string;
  publico: Publico;
  publicoFiltro: Filtro;
  canais: string[];
  assunto: string;
  corpoEmail: string;
  corpoWhatsapp: string;
  status?: string;
}

interface Alcance {
  total: number;
  comEmail: number;
  comWhatsapp: number;
  semNenhum: number;
}

interface RespostaPublico {
  alcance: Alcance;
  resumo: string;
  cidades: string[];
  variaveis: { chave: string; ajuda: string }[];
  usinas: { id: string; nome: string; ucs: number }[];
  amostra: { nome: string; email: string | null; telefone: string | null; unidades: number }[];
  erroTexto?: string;
  previa?: { para: string; assunto: string; html: string; whatsapp: string | null };
}

export default function ComunicadoEditor({
  inicial,
  modo,
}: {
  inicial: ComunicadoForm;
  /** `simulacao` = nada sai para ninguém, e a tela precisa dizer isso. */
  modo: "simulacao" | "real";
}) {
  const router = useRouter();
  const [f, setF] = useState<ComunicadoForm>(inicial);
  const [dados, setDados] = useState<RespostaPublico | null>(null);
  const [carregandoPublico, setCarregandoPublico] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mostrarPrevia, setMostrarPrevia] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [apagando, setApagando] = useState(false);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [emailTeste, setEmailTeste] = useState(EMAIL_TESTE_PADRAO);
  const [testando, setTestando] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🪤 Três estados, não dois. `ENVIANDO` é o disparo que morreu no meio — o
  // texto já não se edita, mas as pessoas que faltam ainda podem ser
  // alcançadas. Tratá-lo como "enviado" deixaria metade da lista sem a
  // mensagem, em silêncio.
  const jaEnviado = !!f.status && f.status !== "RASCUNHO";
  const pelaMetade = f.status === "ENVIANDO";

  const recarregarPublico = useCallback(async () => {
    setCarregandoPublico(true);
    try {
      const r = await fetch("/api/admin/comunicados/publico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publico: f.publico,
          filtro: f.publicoFiltro,
          // 🪤 O corpo do canal DESLIGADO não vai para a prévia. Ele existe no
          // formulário (para o operador poder ligar o canal depois sem perder o
          // texto), mas mostrá-lo faria a prévia exibir uma mensagem que não
          // seria enviada — visto na tela em 06/09/2026, com o WhatsApp
          // desmarcado e o painel dele preenchido assim mesmo.
          assunto: f.canais.includes("EMAIL") ? f.assunto : undefined,
          corpoEmail: f.canais.includes("EMAIL") ? f.corpoEmail : undefined,
          corpoWhatsapp: f.canais.includes("WHATSAPP") ? f.corpoWhatsapp : undefined,
          tipo: f.tipo,
          desenho: f.desenho,
          destaqueRotulo: f.destaqueRotulo,
          destaqueValor: f.destaqueValor,
          destaqueNota: f.destaqueNota,
          botaoTexto: f.botaoTexto,
          botaoUrl: f.botaoUrl,
          botaoNota: f.botaoNota,
        }),
      });
      if (!r.ok) throw new Error("Falha ao calcular o público");
      setDados((await r.json()) as RespostaPublico);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao calcular o público");
    } finally {
      setCarregandoPublico(false);
    }
  }, [f.publico, f.publicoFiltro, f.assunto, f.corpoEmail, f.corpoWhatsapp, f.canais, f.tipo, f.desenho,
    f.destaqueRotulo, f.destaqueValor, f.destaqueNota, f.botaoTexto, f.botaoUrl, f.botaoNota]);

  // O recorte recarrega enquanto se digita, mas não a cada tecla: 500 ms de
  // silêncio. Sem isso, escrever o texto dispararia uma consulta por letra.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void recarregarPublico(), 500);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [recarregarPublico]);

  const salvar = async (): Promise<string | null> => {
    setSalvando(true);
    try {
      const url = f.id ? `/api/admin/comunicados/${f.id}` : "/api/admin/comunicados";
      const r = await fetch(url, {
        method: f.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Não foi possível salvar");
        return null;
      }
      toast.success("Rascunho salvo");
      const id = f.id ?? (j.id as string);
      if (!f.id) router.replace(`/admin/comunicados/${id}`);
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      return null;
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async () => {
    if (!f.id) return;
    setApagando(true);
    try {
      const r = await fetch(`/api/admin/comunicados/${f.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Não foi possível apagar");
        return;
      }
      toast.success("Rascunho apagado");
      router.push("/admin/comunicados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao apagar");
    } finally {
      setApagando(false);
      setConfirmandoApagar(false);
    }
  };

  const testar = async () => {
    const id = await salvar();
    if (!id) return;
    setTestando(true);
    try {
      const r = await fetch(`/api/admin/comunicados/${id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testePara: emailTeste.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Falha no teste");
        return;
      }
      toast.success(
        j.email.enviados > 0
          ? `Teste enviado para ${emailTeste.trim()} — confira a caixa de entrada.`
          : `O teste não saiu: ${j.erros?.[0] ?? "veja o log"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste");
    } finally {
      setTestando(false);
    }
  };

  const disparar = async () => {
    // Retomando um disparo pela metade não há o que salvar: o texto já está
    // gravado e a rota de edição recusa mexer nele.
    const id = pelaMetade ? f.id! : await salvar();
    if (!id) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/admin/comunicados/${id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: true }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Falha no disparo");
        return;
      }
      toast.success(
        modo === "real"
          ? `Enviado: ${j.email.enviados} emails, ${j.whatsapp.enviados} WhatsApps`
          : `Ensaio concluído para ${j.destinatarios} pessoas — nada foi enviado`,
      );
      router.refresh();
      router.push(`/admin/comunicados/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no disparo");
    } finally {
      setEnviando(false);
      setConfirmacao("");
    }
  };

  const alcance = dados?.alcance;
  const canalEmail = f.canais.includes("EMAIL");
  const canalZap = f.canais.includes("WHATSAPP");
  const alvoReal =
    (canalEmail ? (alcance?.comEmail ?? 0) : 0) + (canalZap ? (alcance?.comWhatsapp ?? 0) : 0);

  const setFiltro = (patch: Partial<Filtro>) =>
    setF({ ...f, publicoFiltro: { ...f.publicoFiltro, ...patch } });

  return (
    <div className="space-y-5">
      {modo === "simulacao" && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <span>
              <strong>Modo ensaio.</strong> Nada sai para cliente nenhum: o disparo monta a
              mensagem, grava quem receberia e para. Para enviar de verdade, a variável{" "}
              <code>COMUNICADOS_MODO</code> precisa valer <code>real</code>.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── PARA QUEM ──────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">Para quem</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(PUBLICO_LABEL) as Publico[]).map((p) => (
              <button
                key={p}
                type="button"
                disabled={!!jaEnviado}
                onClick={() => setF({ ...f, publico: p, publicoFiltro: {} })}
                className={`rounded-lg border p-3 text-left text-sm transition-colors disabled:opacity-60 ${
                  f.publico === p ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
                }`}
              >
                {PUBLICO_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            {f.publico === "CLIENTE_DESCONTO" && (
              <label className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Situação
                </span>
                <select
                  disabled={!!jaEnviado}
                  value={f.publicoFiltro.situacao ?? ""}
                  onChange={(e) =>
                    setFiltro({
                      situacao: (e.target.value || undefined) as Filtro["situacao"],
                    })
                  }
                  className="rounded-lg border bg-background px-2 py-1 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="FATURANDO">Já faturando</option>
                  <option value="EM_IMPLANTACAO">Em implantação</option>
                </select>
              </label>
            )}

            {f.publico === "INVESTIDOR" && (
              <label className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Usina</span>
                <select
                  disabled={!!jaEnviado}
                  value={
                    f.publicoFiltro.investidorComUsina === undefined
                      ? ""
                      : String(f.publicoFiltro.investidorComUsina)
                  }
                  onChange={(e) =>
                    setFiltro({
                      investidorComUsina:
                        e.target.value === "" ? undefined : e.target.value === "true",
                    })
                  }
                  className="rounded-lg border bg-background px-2 py-1 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="true">Com usina</option>
                  <option value="false">Sem usina</option>
                </select>
              </label>
            )}

            {f.publico === "CLIENTE_DESCONTO" && !!dados?.usinas?.length && (
              <label className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Usina
                </span>
                <select
                  disabled={!!jaEnviado}
                  value={f.publicoFiltro.plantIds?.[0] ?? ""}
                  onChange={(e) =>
                    setFiltro({ plantIds: e.target.value ? [e.target.value] : undefined })
                  }
                  className="max-w-[220px] rounded-lg border bg-background px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  {dados.usinas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.ucs})
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Cidade</span>
              <select
                disabled={!!jaEnviado}
                value={f.publicoFiltro.cidades?.[0] ?? ""}
                onChange={(e) => setFiltro({ cidades: e.target.value ? [e.target.value] : undefined })}
                className="rounded-lg border bg-background px-2 py-1 text-sm"
              >
                <option value="">Todas</option>
                {(dados?.cidades ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* O contador — a pergunta que importa antes de mandar. */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="h-4 w-4" />
                {carregandoPublico ? "…" : (alcance?.total ?? 0)} pessoas no recorte
              </span>
              <span className="text-muted-foreground">
                <Mail className="mr-1 inline h-3.5 w-3.5" />
                {alcance?.comEmail ?? 0} com email
              </span>
              <span className="text-muted-foreground">
                <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
                {alcance?.comWhatsapp ?? 0} com WhatsApp
              </span>
              {!!alcance?.semNenhum && (
                <span className="text-amber-700 dark:text-amber-400">
                  {alcance.semNenhum} sem contato nenhum
                </span>
              )}
            </div>
            {/* 🔑 Tirar da lista quem não tem o canal é diferente de só não
                alcançá-lo: com o filtro ligado, o número no botão de disparo
                passa a ser o número de gente que vai receber de verdade. */}
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  disabled={!!jaEnviado}
                  checked={!!f.publicoFiltro.somenteComEmail}
                  onChange={(e) => setFiltro({ somenteComEmail: e.target.checked || undefined })}
                  className="h-3.5 w-3.5"
                />
                Só quem tem email
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  disabled={!!jaEnviado}
                  checked={!!f.publicoFiltro.somenteComWhatsapp}
                  onChange={(e) => setFiltro({ somenteComWhatsapp: e.target.checked || undefined })}
                  className="h-3.5 w-3.5"
                />
                Só quem tem WhatsApp
              </label>
            </div>

            {!!dados?.amostra?.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Começa por: {dados.amostra.slice(0, 4).map((a) => a.nome).join(" · ")}
                {(alcance?.total ?? 0) > 4 ? " …" : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── A MENSAGEM, com a prévia AO LADO ──────────────────────────
          🔑 A prévia sai de trás de um botão e passa a viver na tela. Escolher
          desenho e peso é uma decisão visual: julgar pelo nome da opção e
          depois abrir um modal para conferir separa a escolha do resultado. Ao
          lado, cada clique mostra o que muda. */}
      {/* 📐 560px é a largura do PRÓPRIO email — o `max-width` que todos os sete
          desenhos usam. Nessa medida a prévia deixa de ser uma miniatura e passa
          a mostrar as quebras de linha exatamente onde o cliente vai vê-las.
          🪤 O passo em `lg` existe porque a coluna não pode comer o formulário:
          numa tela de 1024px, 560 aqui deixariam o texto do email num campo de
          200px. Quem tem tela larga (xl) recebe os 560 inteiros. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start xl:grid-cols-[minmax(0,1fr)_560px]">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">A mensagem</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              {(["EMAIL", "WHATSAPP"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!!jaEnviado}
                    checked={f.canais.includes(c)}
                    onChange={(e) =>
                      setF({
                        ...f,
                        canais: e.target.checked
                          ? [...f.canais, c]
                          : f.canais.filter((x) => x !== c),
                      })
                    }
                    className="h-4 w-4"
                  />
                  {c === "EMAIL" ? "Email" : "WhatsApp"}
                </label>
              ))}
            </div>
          </div>

          <Campo
            rotulo="Nome (só você vê)"
            valor={f.nome}
            desabilitado={!!jaEnviado}
            onChange={(v) => setF({ ...f, nome: v })}
            ajuda='Ex.: "Reajuste RGE — setembro".'
          />

          {/* ⚠️ O tipo muda SÓ o email. No WhatsApp não existe layout: lá a
              mensagem é texto puro, e a ênfase possível é o operador escrever
              *ATENÇÃO* na primeira linha. */}
          {canalEmail && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Desenho do email
              </label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(DESENHO_LABEL) as Desenho[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!!jaEnviado}
                    onClick={() => setF({ ...f, desenho: d })}
                    className={`rounded-lg border p-2.5 text-left text-sm transition-colors disabled:opacity-60 ${
                      f.desenho === d ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <div>{DESENHO_LABEL[d]}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {DESENHO_QUANDO[d]}
                    </div>
                  </button>
                ))}
              </div>

              {/* Os dois desenhos que pedem mais do que assunto e texto. */}
              {f.desenho === "DESTAQUE" && (
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                  <Campo
                    rotulo="Rótulo"
                    valor={f.destaqueRotulo}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, destaqueRotulo: v })}
                    ajuda="Ex.: Reajuste da RGE"
                  />
                  <Campo
                    rotulo="Valor *"
                    valor={f.destaqueValor}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, destaqueValor: v })}
                    ajuda="Ex.: +8,4%"
                  />
                  <Campo
                    rotulo="Observação"
                    valor={f.destaqueNota}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, destaqueNota: v })}
                    ajuda="Ex.: a partir de setembro"
                  />
                </div>
              )}

              {f.desenho === "BOTAO" && (
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                  <Campo
                    rotulo="Texto do botão *"
                    valor={f.botaoTexto}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, botaoTexto: v })}
                    ajuda="Ex.: Ver a minha fatura"
                  />
                  <Campo
                    rotulo="Link *"
                    valor={f.botaoUrl}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, botaoUrl: v })}
                    ajuda="Precisa começar com https://"
                  />
                  <Campo
                    rotulo="Observação"
                    valor={f.botaoNota}
                    desabilitado={!!jaEnviado}
                    onChange={(v) => setF({ ...f, botaoNota: v })}
                    ajuda="Uma linha dizendo o que o botão abre."
                  />
                </div>
              )}

              {f.desenho === "AVISO_CURTO" && (
                <p className="text-xs text-muted-foreground">
                  Este desenho vive de ser curto: um título e uma frase. Texto longo aqui
                  desmonta o cartão.
                </p>
              )}
            </div>
          )}

          {canalEmail && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Peso da mensagem
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(TIPO_LABEL) as TipoComunicado[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={!!jaEnviado}
                    onClick={() => setF({ ...f, tipo: t })}
                    className={`rounded-lg border p-2.5 text-left text-sm transition-colors disabled:opacity-60 ${
                      f.tipo === t ? `${TIPO_COR[t]} font-medium` : "hover:bg-muted"
                    }`}
                  >
                    <div>{TIPO_LABEL[t]}</div>
                    <div className="text-xs font-normal opacity-75">{TIPO_QUANDO[t]}</div>
                  </button>
                ))}
              </div>
              {f.tipo === "URGENTE" && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Vermelho gasta rápido: se todo comunicado for urgente, o cliente para de
                  distinguir e o destaque perde a função.
                </p>
              )}
              {f.desenho === "CARTA" && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  O desenho <strong>Carta</strong> ignora o peso: ele existe justamente para não
                  ter cor. Para um aviso que precisa parar o cliente, troque de desenho.
                </p>
              )}
              {canalZap && (
                <p className="text-xs text-muted-foreground">
                  Vale só para o email — o WhatsApp não tem layout, é texto puro.
                </p>
              )}
            </div>
          )}

          {canalEmail && (
            <>
              <Campo
                rotulo="Assunto do email"
                valor={f.assunto}
                desabilitado={!!jaEnviado}
                onChange={(v) => setF({ ...f, assunto: v })}
                ajuda="Serve também como título dentro do email."
              />
              <Area
                rotulo="Texto do email"
                valor={f.corpoEmail}
                desabilitado={!!jaEnviado}
                onChange={(v) => setF({ ...f, corpoEmail: v })}
                ajuda="Linha em branco separa parágrafos. O timbre com a marca e o rodapé entram automaticamente."
              />
            </>
          )}

          {canalZap && (
            <Area
              rotulo="Texto do WhatsApp"
              valor={f.corpoWhatsapp}
              desabilitado={!!jaEnviado}
              onChange={(v) => setF({ ...f, corpoWhatsapp: v })}
              ajuda="Só a assinatura é acrescentada. *Entre asteriscos* fica em negrito."
            />
          )}

          {dados?.erroTexto && (
            <p className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {dados.erroTexto}
            </p>
          )}

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Variáveis
            </div>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {(dados?.variaveis ?? []).map((v) => (
                <div key={v.chave} className="flex gap-2 text-xs">
                  <code className="shrink-0 font-medium">{`{{${v.chave}}}`}</code>
                  <span className="text-muted-foreground">{v.ajuda}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <PainelVivo
        dados={dados}
        carregando={carregandoPublico}
        canalEmail={canalEmail}
        canalZap={canalZap}
        onAmpliar={() => setMostrarPrevia(true)}
      />
      </div>

      {/* ── DISPARO PELA METADE ────────────────────────────────────── */}
      {pelaMetade && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                <strong>Este disparo não terminou.</strong> Pode ter estourado o tempo de
                execução no meio da lista. Continuar alcança <strong>só quem ainda não
                recebeu</strong> — quem já recebeu está gravado e é pulado.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void disparar()}
              disabled={enviando}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviando ? "Continuando..." : "Continuar o disparo"}
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── AÇÕES ──────────────────────────────────────────────────── */}
      {!jaEnviado && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {salvando ? "Salvando..." : "Salvar rascunho"}
              </button>
              {/* Só existe enquanto é rascunho. Comunicado disparado é o
                  histórico do que saiu — a rota recusa apagar. */}
              {f.id && !confirmandoApagar && (
                <button
                  type="button"
                  onClick={() => setConfirmandoApagar(true)}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  Apagar
                </button>
              )}
              {f.id && confirmandoApagar && (
                <div className="ml-auto flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Apagar este rascunho?</span>
                  <button
                    type="button"
                    onClick={() => void apagar()}
                    disabled={apagando}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {apagando ? "Apagando..." : "Apagar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoApagar(false)}
                    className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* ── TESTE ────────────────────────────────────────────────
                🔑 Fica ANTES do disparo, e é a caixa calma ao lado da caixa
                vermelha. O teste passa pelo mesmo caminho do envio real —
                mesmo público, mesmo render, mesma gravação — mas manda para
                um endereço só. É como a primeira execução deste código
                acontece contra quem opera, e não contra a carteira. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Testar antes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manda uma cópia única para o seu email, com os dados de um cliente real do
                recorte. Não conta como envio: ninguém da lista recebe, o comunicado continua
                rascunho, e dá para testar quantas vezes quiser.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={emailTeste}
                  onChange={(e) => setEmailTeste(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-64 rounded-lg border bg-background px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void testar()}
                  disabled={testando || !emailTeste.includes("@") || !canalEmail}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {testando ? "Enviando teste..." : "Enviar teste para mim"}
                </button>
              </div>
              {canalZap && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  O teste manda só o email — não há número de teste, e mandar para o WhatsApp
                  do cliente não seria teste, seria envio.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-sm font-medium">
                Disparar para <strong>{alvoReal}</strong> destinatário(s)
                {modo === "simulacao" ? " (ensaio, nada sai)" : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {modo === "real"
                  ? "Não tem desfazer. Cada pessoa recebe uma vez só — o sistema impede o reenvio."
                  : "Nada será enviado. Serve para conferir o recorte e o texto."}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="digite ENVIAR"
                  className="w-40 rounded-lg border bg-background px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void disparar()}
                  disabled={enviando || confirmacao.trim().toUpperCase() !== "ENVIAR" || alvoReal === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {enviando ? "Enviando..." : "Disparar"}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mostrarPrevia && dados?.previa && (
        <Previa dados={dados.previa} onFechar={() => setMostrarPrevia(false)} />
      )}
    </div>
  );
}

/**
 * A prévia AO LADO do formulário, sempre visível e sempre atualizada.
 *
 * 🔑 Escolher desenho e peso é uma decisão visual. Julgar pelo nome da opção e
 * só depois abrir um modal separa a escolha do resultado — aqui cada clique
 * mostra o que muda, no mesmo olhar.
 *
 * ⚠️ **Ela não se aproxima do email, ela É o email**: o HTML vem do servidor,
 * do mesmo `htmlComunicado` que o disparo usa. Uma prévia que reconstruísse o
 * layout na tela um dia mentiria — e a primeira vez que mentisse seria numa
 * mensagem já enviada.
 *
 * Fica `sticky` porque o formulário é mais alto que ela: sem isso, escrever o
 * texto lá embaixo deixaria a prévia fora da tela justamente quando ela serve.
 */
function PainelVivo({
  dados,
  carregando,
  canalEmail,
  canalZap,
  onAmpliar,
}: {
  dados: RespostaPublico | null;
  carregando: boolean;
  canalEmail: boolean;
  canalZap: boolean;
  onAmpliar: () => void;
}) {
  const [aba, setAba] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const previa = dados?.previa;

  // Canal desligado não pode ficar com a aba selecionada — mostraria um painel
  // vazio sem explicar por quê.
  const abaAtiva = aba === "WHATSAPP" && canalZap ? "WHATSAPP" : "EMAIL";

  return (
    <Card className="lg:sticky lg:top-4">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Como o cliente vê</h2>
            <p className="text-xs text-muted-foreground">
              {previa
                ? `Com os dados de ${previa.para}`
                : "Escreva o assunto e o texto para ver aqui"}
            </p>
          </div>
          {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {canalEmail && canalZap && (
          <div className="flex gap-1 rounded-lg border p-0.5">
            {(["EMAIL", "WHATSAPP"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAba(c)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  abaAtiva === c ? "bg-muted" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "EMAIL" ? "Email" : "WhatsApp"}
              </button>
            ))}
          </div>
        )}

        {dados?.erroTexto ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {dados.erroTexto}
          </p>
        ) : !previa ? (
          <div className="flex h-[420px] items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">
            A prévia aparece assim que houver texto.
          </div>
        ) : abaAtiva === "EMAIL" ? (
          <>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Assunto:</span> {previa.assunto}
            </div>
            <iframe
              title="Como o cliente vê o email"
              srcDoc={previa.html}
              className="h-[420px] w-full rounded-lg border bg-white"
            />
          </>
        ) : (
          <pre className="h-[460px] overflow-auto whitespace-pre-wrap rounded-lg border bg-[#E7FFDB] p-3 font-sans text-sm text-[#111B21]">
            {previa.whatsapp ?? "Canal WhatsApp desligado neste comunicado."}
          </pre>
        )}

        {previa && (
          <button
            type="button"
            onClick={onAmpliar}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver maior
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  ajuda,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  ajuda?: string;
  desabilitado?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </label>
      <input
        type="text"
        value={valor}
        disabled={desabilitado}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function Area({
  rotulo,
  valor,
  onChange,
  ajuda,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  ajuda?: string;
  desabilitado?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </label>
      <textarea
        value={valor}
        disabled={desabilitado}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(16, Math.max(6, valor.split("\n").length + 2))}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

function Previa({
  dados,
  onFechar,
}: {
  dados: { para: string; assunto: string; html: string; whatsapp: string | null };
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Prévia</h3>
            <p className="text-xs text-muted-foreground">
              Renderizada para <strong>{dados.para}</strong> — a primeira pessoa do recorte, de
              verdade.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            Fechar
          </button>
        </div>
        <div className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Assunto:</span> {dados.assunto}
            </div>
            <iframe
              title="Prévia do email"
              srcDoc={dados.html}
              className="h-[440px] w-full rounded-lg border bg-white"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              WhatsApp
            </div>
            {dados.whatsapp ? (
              <pre className="h-[440px] overflow-auto whitespace-pre-wrap rounded-lg border bg-[#E7FFDB] p-3 font-sans text-sm text-[#111B21]">
                {dados.whatsapp}
              </pre>
            ) : (
              <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                Canal WhatsApp desligado neste comunicado.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
