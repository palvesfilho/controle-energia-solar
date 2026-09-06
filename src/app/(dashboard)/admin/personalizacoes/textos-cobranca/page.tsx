"use client";

/**
 * Textos de cobrança — O QUE se diz ao cliente em cada momento da régua.
 *
 * Irmã da Cadência de cobranças, que decide QUANDO falar. Aqui ficam quatro
 * estágios (fatura, véspera, atraso recente, atraso prolongado), cada um com
 * assunto, texto de email e texto de WhatsApp.
 *
 * 🔑 **A prévia vem do servidor, não daqui.** Ela passa pelo mesmo código que
 * envia de verdade — uma prévia montada na tela um dia divergiria do que sai,
 * e a divergência só apareceria numa cobrança já entregue.
 *
 * ⚠️ Multa e juros JÁ NASCEM preenchidos (5% e 3% ao mês, decisão dele em
 * 06/09/2026) — ver `ENCARGOS_PADRAO`. Zerar um campo aqui não é "cobrar zero":
 * é **não mandar nada ao Asaas**, preservando o que estiver configurado no
 * painel dele.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, MessageSquare, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Estagio = "FATURA" | "ANTES" | "ATRASO" | "ATRASO_FIRME";

const ESTAGIOS: Estagio[] = ["FATURA", "ANTES", "ATRASO", "ATRASO_FIRME"];

const ROTULO: Record<Estagio, string> = {
  FATURA: "Fatura emitida",
  ANTES: "Antes do vencimento",
  ATRASO: "Atraso recente",
  ATRASO_FIRME: "Atraso prolongado",
};

const QUANDO: Record<Estagio, string> = {
  FATURA: "Vai junto com a fatura do mês, com o demonstrativo em PDF anexo.",
  ANTES: "Nos dias que a cadência marcar antes do vencimento, ou no próprio dia.",
  ATRASO: "Nos dias de atraso da cadência, enquanto o atraso for curto.",
  ATRASO_FIRME: "A partir do dia de atraso configurado abaixo, no lugar do texto anterior.",
};

interface TextoEstagio {
  assunto: string;
  corpoEmail: string;
  corpoWhatsapp: string;
}

interface Encargos {
  multaPercentual: number;
  jurosMensalPercentual: number;
  atrasoFirmeDias: number;
}

interface Variavel {
  chave: string;
  ajuda: string;
}

interface Carga {
  textos: Record<Estagio, TextoEstagio>;
  encargos: Encargos;
  padrao: Record<Estagio, TextoEstagio>;
  variaveis: Variavel[];
}

interface Previa {
  assunto: string;
  html: string;
  whatsapp: string;
}

export default function TextosCobrancaPage() {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [textos, setTextos] = useState<Record<Estagio, TextoEstagio> | null>(null);
  const [encargos, setEncargos] = useState<Encargos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<{ estagio: Estagio; dados: Previa } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/textos-cobranca");
      if (!r.ok) throw new Error("Falha ao carregar os textos");
      const j = (await r.json()) as Carga;
      setCarga(j);
      setTextos(j.textos);
      setEncargos(j.encargos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const editar = (estagio: Estagio, campo: keyof TextoEstagio, valor: string) => {
    if (!textos) return;
    setTextos({ ...textos, [estagio]: { ...textos[estagio], [campo]: valor } });
  };

  const voltarAoPadrao = (estagio: Estagio) => {
    if (!textos || !carga) return;
    setTextos({ ...textos, [estagio]: { ...carga.padrao[estagio] } });
    toast.success(`"${ROTULO[estagio]}" voltou ao texto padrão — salve para valer.`);
  };

  const verPrevia = async (estagio: Estagio) => {
    if (!textos || !encargos) return;
    try {
      const r = await fetch("/api/admin/textos-cobranca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estagio, texto: textos[estagio], encargos }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Não foi possível montar a prévia");
        return;
      }
      setPrevia({ estagio, dados: j as Previa });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na prévia");
    }
  };

  const salvar = async () => {
    if (!textos || !encargos) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/admin/textos-cobranca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textos, encargos }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "Não foi possível salvar");
        return;
      }
      toast.success("Textos e encargos salvos");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/personalizacoes"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Textos de cobrança e encargos</h1>
          <p className="text-sm text-muted-foreground">
            A multa e os juros do boleto, e o que o cliente lê em cada momento. Quando ele lê se decide na{" "}
            <Link
              href="/admin/personalizacoes/cadencia-cobrancas"
              className="underline underline-offset-2"
            >
              cadência de cobranças
            </Link>
            .
          </p>
        </div>
      </div>

      {carregando && !textos ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : !textos || !encargos || !carga ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar a configuração.
        </p>
      ) : (
        <>
          {/* ── ENCARGOS ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-sm font-semibold">Encargos do boleto</h2>
                <p className="text-xs text-muted-foreground">
                  Vão para o Asaas na criação da cobrança e alimentam as variáveis{" "}
                  <code>{"{{multa}}"}</code> e <code>{"{{juros}}"}</code> nos textos.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Campo
                  rotulo="Multa por atraso (%)"
                  valor={String(encargos.multaPercentual)}
                  onChange={(v) =>
                    setEncargos({ ...encargos, multaPercentual: Number(v.replace(",", ".")) || 0 })
                  }
                  ajuda="Percentual sobre o valor, cobrado uma vez."
                />
                <Campo
                  rotulo="Juros ao mês (%)"
                  valor={String(encargos.jurosMensalPercentual)}
                  onChange={(v) =>
                    setEncargos({
                      ...encargos,
                      jurosMensalPercentual: Number(v.replace(",", ".")) || 0,
                    })
                  }
                  ajuda="Juros de mora mensais, proporcionais aos dias de atraso."
                />
                <Campo
                  rotulo="Tom firme a partir do dia"
                  valor={String(encargos.atrasoFirmeDias)}
                  onChange={(v) =>
                    setEncargos({ ...encargos, atrasoFirmeDias: Number(v) || 0 })
                  }
                  ajuda='Daí em diante vale o texto "Atraso prolongado".'
                />
              </div>

              {(encargos.multaPercentual === 0 || encargos.jurosMensalPercentual === 0) && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Zero significa <strong>não enviar</strong>{" "}o encargo ao Asaas — e não
                    &quot;cobrar zero&quot;. Se a sua conta do Asaas tiver multa ou juros
                    configurados no painel, eles continuam valendo. Preencher aqui passa a
                    mandar o valor em cada cobrança nova.
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Vale só para cobranças <strong>novas</strong>. Boleto já emitido não muda.
              </p>
            </CardContent>
          </Card>

          {/* ── OS QUATRO ESTÁGIOS ───────────────────────────────────── */}
          {ESTAGIOS.map((estagio) => (
            <Card key={estagio}>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{ROTULO[estagio]}</h2>
                    <p className="text-xs text-muted-foreground">{QUANDO[estagio]}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void verPrevia(estagio)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver como fica
                    </button>
                    <button
                      type="button"
                      onClick={() => voltarAoPadrao(estagio)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Voltar ao padrão
                    </button>
                  </div>
                </div>

                <Campo
                  rotulo="Assunto do email"
                  valor={textos[estagio].assunto}
                  onChange={(v) => editar(estagio, "assunto", v)}
                  ajuda="Serve também como título dentro do email."
                />

                <Area
                  rotulo="Texto do email"
                  valor={textos[estagio].corpoEmail}
                  onChange={(v) => editar(estagio, "corpoEmail", v)}
                  ajuda="Linha em branco separa parágrafos. Valor, vencimento e botão de pagar entram automaticamente abaixo do texto."
                />

                <Area
                  rotulo="Texto do WhatsApp"
                  valor={textos[estagio].corpoWhatsapp}
                  onChange={(v) => editar(estagio, "corpoWhatsapp", v)}
                  ajuda="No WhatsApp nada é acrescentado além da assinatura — o que estiver aqui é a mensagem inteira. *Entre asteriscos* fica em negrito."
                />

                <AvisoEncargoZerado texto={textos[estagio]} encargos={encargos} />
              </CardContent>
            </Card>
          ))}

          {/* ── AS VARIÁVEIS ─────────────────────────────────────────── */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <h2 className="text-sm font-semibold">Variáveis</h2>
                <p className="text-xs text-muted-foreground">
                  Escreva entre chaves duplas. Qualquer outra coisa entre chaves é recusada
                  ao salvar — melhor um erro na tela do que{" "}
                  <code>{"{{nomeErrado}}"}</code> no email do cliente.
                </p>
              </div>
              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {carga.variaveis.map((v) => (
                  <div key={v.chave} className="flex gap-2 text-xs">
                    <code className="shrink-0 font-medium">{`{{${v.chave}}}`}</code>
                    <span className="text-muted-foreground">{v.ajuda}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {salvando ? "Salvando..." : "Salvar textos e encargos"}
            </button>
            <span className="text-xs text-muted-foreground">
              Vale para os próximos envios. Mensagem já enviada não muda.
            </span>
          </div>
        </>
      )}

      {previa && (
        <PainelPrevia
          rotulo={ROTULO[previa.estagio]}
          dados={previa.dados}
          onFechar={() => setPrevia(null)}
        />
      )}
    </div>
  );
}

/**
 * Avisa quando o texto cita `{{multa}}` ou `{{juros}}` com o valor em ZERO.
 *
 * 🔑 Nasceu de um defeito visto na prévia em 06/09/2026: o texto de atraso
 * prolongado dizia "já contempla multa de — e juros de —", porque a variável
 * de um encargo zerado vira um travessão. A frase ia inteira para o cliente,
 * sem nada apitar.
 */
function AvisoEncargoZerado({
  texto,
  encargos,
}: {
  texto: TextoEstagio;
  encargos: Encargos;
}) {
  const tudo = `${texto.assunto}\n${texto.corpoEmail}\n${texto.corpoWhatsapp}`;
  const faltando: string[] = [];
  if (tudo.includes("{{multa}}") && encargos.multaPercentual === 0) faltando.push("{{multa}}");
  if (tudo.includes("{{juros}}") && encargos.jurosMensalPercentual === 0) faltando.push("{{juros}}");
  if (faltando.length === 0) return null;

  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Este texto usa {faltando.join(" e ")}, mas o valor está zerado lá em cima. O cliente
        leria um travessão no lugar do percentual — preencha o encargo ou tire a variável do
        texto.
      </span>
    </p>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  ajuda,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  ajuda?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </label>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  ajuda?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </label>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(14, Math.max(4, valor.split("\n").length + 1))}
        className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

/**
 * A prévia lado a lado: o email como ele chega e o WhatsApp como ele chega.
 *
 * O email vai num `<iframe srcDoc>` para o CSS do email não vazar para o
 * painel — e para o que se vê ser exatamente o documento que o cliente abre.
 */
function PainelPrevia({
  rotulo,
  dados,
  onFechar,
}: {
  rotulo: string;
  dados: Previa;
  onFechar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onFechar}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Prévia — {rotulo}</h3>
            <p className="text-xs text-muted-foreground">
              Cliente fictício, montado pelo mesmo código que envia de verdade.
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
              className="h-[420px] w-full rounded-lg border bg-white"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              WhatsApp
            </div>
            <pre className="h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border bg-[#E7FFDB] p-3 font-sans text-sm text-[#111B21]">
              {dados.whatsapp}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
