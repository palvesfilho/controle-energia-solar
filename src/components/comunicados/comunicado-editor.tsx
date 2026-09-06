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
import { Eye, Loader2, Mail, MessageSquare, Save, Send, TriangleAlert, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Publico = "INVESTIDOR" | "CLIENTE_DESCONTO";

const PUBLICO_LABEL: Record<Publico, string> = {
  CLIENTE_DESCONTO: "Clientes com desconto na fatura",
  INVESTIDOR: "Investidores (donos de usina)",
};

export interface Filtro {
  cidades?: string[];
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

export interface ComunicadoForm {
  id?: string;
  nome: string;
  tipo: TipoComunicado;
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
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jaEnviado = f.status && f.status !== "RASCUNHO";

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
        }),
      });
      if (!r.ok) throw new Error("Falha ao calcular o público");
      setDados((await r.json()) as RespostaPublico);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao calcular o público");
    } finally {
      setCarregandoPublico(false);
    }
  }, [f.publico, f.publicoFiltro, f.assunto, f.corpoEmail, f.corpoWhatsapp, f.canais, f.tipo]);

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

  const disparar = async () => {
    const id = await salvar();
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
            {!!dados?.amostra?.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Começa por: {dados.amostra.slice(0, 4).map((a) => a.nome).join(" · ")}
                {(alcance?.total ?? 0) > 4 ? " …" : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── A MENSAGEM ─────────────────────────────────────────────── */}
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
              <button
                type="button"
                onClick={() => setMostrarPrevia(true)}
                disabled={!dados?.previa}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Ver como fica
              </button>
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
