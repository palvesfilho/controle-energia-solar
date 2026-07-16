"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  X,
  Send,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  ShieldAlert,
  ExternalLink,
  AlertTriangle,
  Mail,
  Gift,
  Lock,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

type Modalidade = "MENSAL" | "ANUAL" | "CORTESIA";
type Tipo = "MENSAL" | "ANUAL" | "PERSONALIZADO" | "CORTESIA";

interface Acesso {
  id: string;
  modalidade: Modalidade;
  valor: number;
  status: "AGUARDANDO_PAGAMENTO" | "ATIVO" | "SUSPENSO" | "CANCELADO";
  checkoutUrl: string | null;
  // Link da tela de pagamento BRANDED (nosso visual). Preferir a este; cai pro
  // checkoutUrl (Asaas) só se não vier (ex.: APP_BASE_URL não configurado).
  pagamentoUrl?: string | null;
  vigenteDesde: string | null;
  vigenteAte: string | null;
  conviteEnviadoEm: string | null;
  pagoEm: string | null;
  ativadoEm: string | null;
}

interface ValoresTabela {
  mensal: number;
  anual: number;
}

interface Props {
  proprietarioId: string;
  proprietarioNome: string;
  temCpfCnpj: boolean;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const inputCls =
  "text-sm border rounded-lg px-3 py-2 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-full";

const TIPOS: { key: Tipo; label: string }[] = [
  { key: "MENSAL", label: "Mensal (recorrente)" },
  { key: "ANUAL", label: "Anual (à vista)" },
  { key: "PERSONALIZADO", label: "Personalizado" },
  { key: "CORTESIA", label: "Cortesia" },
];

export function ConviteAcessoModal({
  proprietarioId,
  proprietarioNome,
  temCpfCnpj,
  open,
  onClose,
  onChanged,
}: Props) {
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [valoresTabela, setValoresTabela] = useState<ValoresTabela>({
    mensal: 0,
    anual: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingCadastro, setSendingCadastro] = useState(false);

  const [tipo, setTipo] = useState<Tipo>("MENSAL");
  // Modo personalizado: cobra mensal OU anual, com valor livre (>= tabela).
  const [personalizadoModalidade, setPersonalizadoModalidade] =
    useState<"MENSAL" | "ANUAL">("MENSAL");
  const [valorPersonalizado, setValorPersonalizado] = useState("");

  // Cortesia
  const [cortesiaInicio, setCortesiaInicio] = useState("");
  const [cortesiaFim, setCortesiaFim] = useState("");
  const [cortesiaSenha, setCortesiaSenha] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCopied(false);
    fetch(`/api/brasil-solar/proprietarios/${proprietarioId}/convite`)
      .then((r) => r.json())
      .then((d) => {
        const ac: Acesso | null = d?.acesso ?? null;
        setAcesso(ac);
        if (d?.valoresTabela) setValoresTabela(d.valoresTabela);
        // Editar cobrança pendente: pré-carrega o valor atual pra facilitar o ajuste.
        if (ac && ac.status !== "ATIVO") {
          if (ac.modalidade === "CORTESIA") {
            setTipo("CORTESIA");
          } else {
            setTipo("PERSONALIZADO");
            setPersonalizadoModalidade(ac.modalidade);
            setValorPersonalizado(ac.valor > 0 ? String(ac.valor) : "");
          }
        }
      })
      .finally(() => setLoading(false));
  }, [open, proprietarioId]);

  if (!open) return null;

  const jaAtivo = acesso?.status === "ATIVO";
  // Link que vai pro cliente: tela branded nossa, com fallback pro checkout Asaas.
  const linkPagamento = acesso?.pagamentoUrl ?? acesso?.checkoutUrl ?? null;

  const recarregar = async () => {
    const r2 = await fetch(
      `/api/brasil-solar/proprietarios/${proprietarioId}/convite`,
    );
    const d2 = await r2.json();
    setAcesso(d2?.acesso ?? null);
    if (d2?.valoresTabela) setValoresTabela(d2.valoresTabela);
    onChanged?.();
  };

  // Gera cobrança (Mensal / Anual / Personalizado) — passa pelo Asaas.
  const handleGerarCobranca = async () => {
    let modalidade: "MENSAL" | "ANUAL";
    let valor: number;

    if (tipo === "MENSAL") {
      modalidade = "MENSAL";
      valor = valoresTabela.mensal;
    } else if (tipo === "ANUAL") {
      modalidade = "ANUAL";
      valor = valoresTabela.anual;
    } else {
      // PERSONALIZADO
      modalidade = personalizadoModalidade;
      valor = Number(valorPersonalizado.replace(",", "."));
      const min =
        modalidade === "ANUAL" ? valoresTabela.anual : valoresTabela.mensal;
      if (!Number.isFinite(valor) || valor <= 0) {
        toast.error("Informe um valor maior que zero.");
        return;
      }
      if (min > 0 && valor < min) {
        toast.error(
          `O valor não pode ser menor que o de tabela (${formatBRL(min)}).`,
        );
        return;
      }
    }

    if (!(valor > 0)) {
      toast.error(
        "Valor de tabela não definido. Configure em Personalizações → Acesso ao portal do cliente.",
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/convite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modalidade, valor }),
        },
      );
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao gerar convite.");
        return;
      }
      toast.success("Cobrança criada. Link de pagamento pronto para enviar.");
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  // Libera cortesia (gratuito) — exige senha do admin.
  const handleCortesia = async () => {
    if (!cortesiaInicio || !cortesiaFim) {
      toast.error("Escolha o período (início e fim).");
      return;
    }
    if (cortesiaFim <= cortesiaInicio) {
      toast.error("A data de fim deve ser posterior à de início.");
      return;
    }
    if (!cortesiaSenha) {
      toast.error("Digite sua senha para liberar a cortesia.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/convite/cortesia`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inicio: cortesiaInicio,
            fim: cortesiaFim,
            senha: cortesiaSenha,
          }),
        },
      );
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao liberar cortesia.");
        return;
      }
      toast.success("Acesso de cortesia liberado.");
      setCortesiaSenha("");
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  const handleEnviarCadastro = async () => {
    if (
      !confirm(
        "Isso envia um e-mail de convite de cadastro ao cliente (login e senha). Continuar?",
      )
    )
      return;
    setSendingCadastro(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/convite/enviar-cadastro`,
        { method: "POST" },
      );
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao enviar convite de cadastro.");
        return;
      }
      toast.success(`Convite de cadastro enviado para ${d.email}.`);
      await recarregar();
    } finally {
      setSendingCadastro(false);
    }
  };

  // Cancela a cobrança/acesso (encerra assinatura ou apaga cobrança no Asaas).
  const handleCancelar = async () => {
    const msg = jaAtivo
      ? "Cancelar o acesso deste cliente? Se for mensal, a assinatura recorrente é encerrada no Asaas."
      : "Cancelar a cobrança enviada? O link de pagamento deixa de valer.";
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/brasil-solar/proprietarios/${proprietarioId}/convite`,
        { method: "DELETE" },
      );
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Erro ao cancelar.");
        return;
      }
      toast.success("Cobrança/acesso cancelado.");
      await recarregar();
    } finally {
      setSaving(false);
    }
  };

  const copiarLink = async () => {
    if (!linkPagamento) return;
    try {
      await navigator.clipboard.writeText(linkPagamento);
      setCopied(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar — copie manualmente do campo.");
    }
  };

  const valorTabelaTipo =
    tipo === "ANUAL" ? valoresTabela.anual : valoresTabela.mensal;
  const semValorTabela =
    (tipo === "MENSAL" || tipo === "ANUAL") && !(valorTabelaTipo > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-base">Acesso ao portal do cliente</h3>
            <p className="text-xs text-muted-foreground">{proprietarioNome}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Carregando...
            </div>
          ) : (
            <>
              <StatusBlock acesso={acesso} />

              {/* Cancelar cobrança/acesso — vale pra pendente e pra ativo */}
              {acesso && acesso.status !== "CANCELADO" && (
                <div className="flex justify-end">
                  <button
                    onClick={handleCancelar}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    {jaAtivo ? "Cancelar acesso" : "Cancelar cobrança"}
                  </button>
                </div>
              )}

              {!jaAtivo && tipo !== "CORTESIA" && !temCpfCnpj && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2 text-sm">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <span>
                    Este proprietário não tem <strong>CPF/CNPJ</strong> cadastrado —
                    é obrigatório para gerar a cobrança. Cadastre antes de enviar o
                    convite, ou use <strong>Cortesia</strong>.
                  </span>
                </div>
              )}

              {/* Acesso ativo → enviar link de cadastro (login/senha) */}
              {jaAtivo && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="text-sm font-medium">Cadastro do cliente</div>
                  <p className="text-xs text-muted-foreground">
                    Envie o e-mail com o link de login e senha. O cliente cria a
                    senha e passa a acessar o portal com as usinas dele.
                  </p>
                  {acesso?.conviteEnviadoEm && (
                    <p className="text-xs text-emerald-600">
                      Último envio em {formatDate(acesso.conviteEnviadoEm)}
                    </p>
                  )}
                  <button
                    onClick={handleEnviarCadastro}
                    disabled={sendingCadastro}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {sendingCadastro ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {sendingCadastro
                      ? "Enviando..."
                      : acesso?.conviteEnviadoEm
                        ? "Reenviar link de cadastro"
                        : "Enviar link de cadastro"}
                  </button>
                </div>
              )}

              {/* Link de pagamento pronto */}
              {linkPagamento && !jaAtivo && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="text-sm font-medium">Link de pagamento do cliente</div>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={linkPagamento}
                      className={`${inputCls} font-mono text-xs`}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={copiarLink}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <a
                    href={linkPagamento}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir página de pagamento
                  </a>
                  <p className="text-xs text-muted-foreground">
                    O cliente escolhe cartão, Pix ou boleto na nossa página de
                    pagamento (marca Brasil Solar). Assim que o pagamento confirmar,
                    ele recebe o link de cadastro automaticamente.
                  </p>
                </div>
              )}

              {/* Formulário — some quando já ativo */}
              {!jaAtivo && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="text-sm font-medium">
                    {acesso ? "Refazer acesso" : "Liberar acesso"}
                  </div>

                  {/* Seletor de tipo */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Tipo de acesso
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {TIPOS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setTipo(t.key)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                            tipo === t.key
                              ? "border-primary bg-primary/10 font-medium"
                              : "hover:bg-muted"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MENSAL / ANUAL — valor de tabela travado */}
                  {(tipo === "MENSAL" || tipo === "ANUAL") && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Valor {tipo === "MENSAL" ? "mensal" : "anual"} (tabela)
                      </label>
                      <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                        <span className="text-sm font-semibold">
                          {formatBRL(valorTabelaTipo)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tipo === "MENSAL" ? "por mês" : "por ano"}
                        </span>
                      </div>
                      {semValorTabela && (
                        <p className="text-xs text-amber-600 mt-1">
                          Valor de tabela não definido. Configure em Personalizações →
                          Acesso ao portal do cliente.
                        </p>
                      )}
                    </div>
                  )}

                  {/* PERSONALIZADO — sub-toggle + valor livre >= tabela */}
                  {tipo === "PERSONALIZADO" && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Cobrança
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(["MENSAL", "ANUAL"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPersonalizadoModalidade(m)}
                              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                                personalizadoModalidade === m
                                  ? "border-primary bg-primary/10 font-medium"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {m === "MENSAL" ? "Mensal (recorrente)" : "Anual (à vista)"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Valor {personalizadoModalidade === "MENSAL" ? "mensal" : "anual"} (R$)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={valorPersonalizado}
                          onChange={(e) => setValorPersonalizado(e.target.value)}
                          className={inputCls}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Mínimo (tabela):{" "}
                          <strong>
                            {formatBRL(
                              personalizadoModalidade === "ANUAL"
                                ? valoresTabela.anual
                                : valoresTabela.mensal,
                            )}
                          </strong>
                          . O valor nunca pode ser menor que o de tabela.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* CORTESIA — período + senha do admin */}
                  {tipo === "CORTESIA" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-teal-300 bg-teal-50 dark:bg-teal-950/20 p-2.5 flex gap-2 text-xs">
                        <Gift className="h-4 w-4 text-teal-600 shrink-0" />
                        <span>
                          Acesso gratuito, sem cobrança. Escolha o período e confirme
                          com a sua senha de administrador.
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Início
                          </label>
                          <input
                            type="date"
                            value={cortesiaInicio}
                            onChange={(e) => setCortesiaInicio(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Fim
                          </label>
                          <input
                            type="date"
                            value={cortesiaFim}
                            onChange={(e) => setCortesiaFim(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Sua senha de administrador
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <input
                            type="password"
                            autoComplete="off"
                            placeholder="Confirme com sua senha"
                            value={cortesiaSenha}
                            onChange={(e) => setCortesiaSenha(e.target.value)}
                            className={`${inputCls} pl-9`}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ação */}
                  <div className="flex justify-end">
                    {tipo === "CORTESIA" ? (
                      <button
                        onClick={handleCortesia}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Gift className="h-4 w-4" />
                        )}
                        {saving ? "Liberando..." : "Liberar cortesia"}
                      </button>
                    ) : (
                      <button
                        onClick={handleGerarCobranca}
                        disabled={saving || !temCpfCnpj || semValorTabela}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        {saving ? "Gerando..." : "Gerar cobrança"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBlock({ acesso }: { acesso: Acesso | null }) {
  if (!acesso) {
    return (
      <div className="rounded-lg border-2 border-muted bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Send className="h-5 w-5" />
          <span className="font-semibold">Sem acesso ao portal</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Escolha o tipo de acesso abaixo para liberar o portal ao cliente.
        </p>
      </div>
    );
  }
  const isCortesia = acesso.modalidade === "CORTESIA";
  if (acesso.status === "ATIVO") {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
          {isCortesia ? <Gift className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          <span className="font-semibold">
            {isCortesia ? "Cortesia ativa" : "Acesso ativo"}
          </span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          {isCortesia ? (
            <>
              Gratuito
              {acesso.vigenteDesde && (
                <> · de <strong>{formatDate(acesso.vigenteDesde)}</strong></>
              )}
              {acesso.vigenteAte && (
                <> até <strong>{formatDate(acesso.vigenteAte)}</strong></>
              )}
            </>
          ) : (
            <>
              {formatBRL(acesso.valor)} /{" "}
              {acesso.modalidade === "MENSAL" ? "mês" : "ano"}
              {acesso.vigenteAte && (
                <> · vigente até <strong>{formatDate(acesso.vigenteAte)}</strong></>
              )}
            </>
          )}
        </p>
      </div>
    );
  }
  if (acesso.status === "SUSPENSO") {
    return (
      <div className="rounded-lg border-2 border-red-300 bg-red-50 dark:bg-red-950/20 p-3">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <ShieldAlert className="h-5 w-5" />
          <span className="font-semibold">Acesso suspenso</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Pagamento em atraso. Refaça a cobrança para reativar.
        </p>
      </div>
    );
  }
  if (acesso.status === "CANCELADO") {
    return (
      <div className="rounded-lg border-2 border-muted bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Ban className="h-5 w-5" />
          <span className="font-semibold">Cobrança cancelada</span>
        </div>
        <p className="text-sm mt-1 text-muted-foreground">
          Gere uma nova cobrança abaixo ou libere cortesia para reativar o acesso.
        </p>
      </div>
    );
  }
  // AGUARDANDO_PAGAMENTO
  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
        <Clock className="h-5 w-5" />
        <span className="font-semibold">Aguardando pagamento</span>
      </div>
      <p className="text-sm mt-1 text-muted-foreground">
        {formatBRL(acesso.valor)} /{" "}
        {acesso.modalidade === "MENSAL" ? "mês" : "ano"} · envie o link abaixo ao
        cliente.
      </p>
    </div>
  );
}
