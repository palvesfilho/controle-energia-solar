"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdicionarUc, type UnidadeDisponivel } from "@/components/rateios/adicionar-uc";
import {
  SugestaoPercentuais,
  type ModoSugestao,
} from "@/components/rateios/sugestao-percentuais";
import {
  consumoDaUc,
  sugerirPercentuais,
  sugestaoComoTexto,
  type OrigemConsumo,
} from "@/lib/rateio-sugestao";
import {
  Check,
  Clock,
  Copy,
  History,
  Loader2,
  Mail,
  Pencil,
  PieChart,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCodigoUc } from "@/lib/uc-codigo";
import {
  formatCpfCnpj,
  isDocumentoValido,
  repoeZerosAEsquerda,
} from "@/lib/documento";

interface PlantOption {
  id: string;
  name: string;
  location: string | null;
  /**
   * Código da UC da própria usina (cadastro da Plant). É o número que o
   * operador digita no portal da concessionária pra montar o rateio — por isso
   * anda junto do nome da usina na tela.
   *
   * NÃO é o `numeroUsina` (10 dígitos, outro identificador da RGE) e quase
   * nunca existe como ConsumerUnit: em 22/08/2026, das 29 usinas, 25 têm este
   * campo e só 2 casam com uma UC cadastrada. A fonte é o cadastro da usina.
   */
  unidadeConsumidora: string | null;
}

interface ConsumerUnitLite {
  id: string;
  nome: string;
  codigoUc: string | null;
  codigoUcAntigo?: string | null;
  cpfCnpj?: string | null;
  cidade: string | null;
  distribuidora: string | null;
  consumoMedio?: number | null;
  consumoReal?: number | null;
  consumoRealMeses?: number;
  isGeradora?: boolean;
}

interface RateioItem {
  id: string;
  percentual: number;
  consumerUnit: ConsumerUnitLite;
  creditosCompensadosKwh: number | null;
}

interface Rateio {
  id: string;
  status: string;
  observacao: string | null;
  /** Nº de protocolo da concessionária. Null nos rateios criados antes de 22/08/2026. */
  protocolo: string | null;
  vigenteAPartirDe: string;
  criadoEm: string;
  enviadoEm: string | null;
  aceitoEm: string | null;
  rejeitadoEm: string | null;
  items: RateioItem[];
}

interface RateioResponse {
  plant: {
    id: string;
    name: string;
    /** Código da UC da usina — e o anterior à migração da RGE (jul/2026). */
    unidadeConsumidora: string | null;
    unidadeConsumidoraAntiga: string | null;
    /** CPF/CNPJ do titular da conta de energia da usina. */
    cpfCnpj: string | null;
    regraInstalacao: string | null;
    /** Geração de contrato — denominador da leitura de ocupação na sugestão. */
    geracaoMediaMensal: number | null;
  };
  periodo: { ano: number; mes: number } | null;
  vigente: Rateio | null;
  pendente: Rateio | null;
  historico: Rateio[];
  /** UCs vinculadas a ESTA usina — "fora do rateio", KPIs e o estado inicial. */
  consumerUnits: ConsumerUnitLite[];
  /** Todas as UCs ativas, para o seletor "+ Adicionar UC". */
  unidadesDisponiveis: UnidadeDisponivel[];
}

/**
 * As duas leituras de consumo da UC, uma abaixo da outra:
 *  - **Consumo de contrato** — `ConsumerUnit.consumoMedio`, o que o cliente declarou;
 *  - **Consumo real** — média das faturas dos últimos 12 meses.
 *
 * A sugestão de percentuais usa o MAIOR dos dois (pedido de 22/08/2026), e o
 * que venceu aparece marcado: sem isso o operador vê dois números e não sabe
 * qual pesou no percentual.
 */
function ConsumosDaUc({
  contrato,
  real,
  meses,
  origem,
}: {
  contrato: number | null | undefined;
  real: number | null | undefined;
  meses: number | undefined;
  /** Qual dos dois a sugestão usou; null quando a UC ficou fora dela. */
  origem: OrigemConsumo | null;
}) {
  const kwh = (v: number) =>
    `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh/mês`;
  const temContrato = typeof contrato === "number" && contrato > 0;
  const temReal = typeof real === "number" && real > 0;

  if (!temContrato && !temReal) {
    return (
      <p className="mt-0.5 text-[11px] text-amber-600">
        Sem consumo de contrato nem faturas — fora da sugestão
      </p>
    );
  }

  const marca = (usado: boolean) =>
    usado ? "text-foreground font-medium" : "text-muted-foreground";

  return (
    <div className="mt-0.5 space-y-0.5">
      <p className={`text-[11px] ${marca(origem === "CONTRATO")}`}>
        Consumo de contrato{" "}
        {temContrato ? kwh(contrato!) : <span className="text-muted-foreground">não cadastrado</span>}
        {origem === "CONTRATO" ? " · usado na sugestão" : ""}
      </p>
      <p className={`text-[11px] ${marca(origem === "REAL")}`}>
        Consumo real{" "}
        {temReal ? (
          <>
            {kwh(real!)}
            {meses ? (
              <span className="text-muted-foreground">
                {" "}
                (média de {meses} fatura{meses > 1 ? "s" : ""})
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">sem faturas nos últimos 12 meses</span>
        )}
        {origem === "REAL" ? " · usado na sugestão" : ""}
      </p>
    </div>
  );
}

/**
 * Valor que se copia com um clique. Copia sempre a versão CRUA (só dígitos):
 * é o formato que o portal da concessionária aceita, e é o que evita o
 * vai-e-volta de apagar pontuação na mão.
 */
function Copiavel({
  bruto,
  children,
  title,
}: {
  bruto: string;
  children: React.ReactNode;
  title: string;
}) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        navigator.clipboard?.writeText(bruto).then(
          () => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          },
          () => {},
        );
      }}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
    >
      {children}
      {copiado ? (
        <Check className="h-3 w-3 shrink-0 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-40" />
      )}
    </button>
  );
}

/**
 * A UC **âncora** do rateio: a de maior consumo entre as que entram na conta.
 *
 * Usa a mesma régua da sugestão (`consumoDaUc` — o maior entre contrato e real),
 * porque âncora medida por outro critério seria uma UC que não é a que mais
 * pesa no percentual.
 *
 * A geradora fica fora: ela é 0% fixo, não disputa consumo. Empate exato marca
 * TODAS as empatadas — escolher uma no par ou ímpar seria decidir por conta
 * própria algo que a tela não sabe.
 */
function idsAncora(
  ucs: Array<{
    id: string;
    consumoMedio?: number | null;
    consumoReal?: number | null;
    isGeradora?: boolean;
  }>,
): Set<string> {
  const comConsumo = ucs
    .filter((u) => !u.isGeradora)
    .map((u) => ({ id: u.id, valor: consumoDaUc(u)?.valor ?? 0 }))
    .filter((x) => x.valor > 0);
  if (comConsumo.length === 0) return new Set();

  const maior = Math.max(...comConsumo.map((x) => x.valor));
  return new Set(comConsumo.filter((x) => x.valor === maior).map((x) => x.id));
}

/** Marca a UC de maior consumo do rateio. */
function TagAncora() {
  return (
    <Badge
      variant="outline"
      className="border-green-600/40 bg-green-100 text-[10px] text-green-800 dark:bg-green-950/60 dark:text-green-300"
      title="Maior consumo do rateio (maior entre contrato e real)"
    >
      ÂNCORA
    </Badge>
  );
}

/** Fundo da linha da UC âncora — verde claro, nos dois temas. */
const LINHA_ANCORA = "bg-green-50 dark:bg-green-950/25";

/**
 * Coluna "UC": o código atual e, abaixo, o ANTERIOR à migração da RGE
 * (jul/2026 — o portal ainda pede o velho de vez em quando). Cada um copiável
 * com um clique, já sem pontuação.
 */
function CodigosUc({
  codigoUc,
  codigoUcAntigo,
}: {
  codigoUc: string | null;
  codigoUcAntigo?: string | null;
}) {
  const antigo = codigoUcAntigo?.trim() || null;
  return (
    <div className="space-y-0.5 text-xs">
      {codigoUc ? (
        <Copiavel bruto={codigoUc} title="Copiar código da UC (sem pontuação)">
          {formatCodigoUc(codigoUc)}
        </Copiavel>
      ) : (
        <span className="text-muted-foreground">-</span>
      )}

      {antigo ? (
        <div>
          <Copiavel bruto={antigo} title="Copiar código antigo (sem pontuação)">
            <span className="text-muted-foreground">antiga {formatCodigoUc(antigo)}</span>
          </Copiavel>
        </div>
      ) : (
        <div className="px-1 text-[11px] text-muted-foreground">sem código antigo</div>
      )}
    </div>
  );
}

/**
 * Coluna "CPF/CNPJ": documento do titular da conta de energia, copiável só com
 * dígitos. O rótulo sai do próprio número — 11 dígitos é CPF, 14 é CNPJ — e não
 * de um campo "tipo de pessoa", que não existe no cadastro.
 */
function DocumentoUc({ cpfCnpj }: { cpfCnpj?: string | null }) {
  const doc = cpfCnpj?.trim() || null;
  if (!doc) {
    return (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-500">
        sem CPF/CNPJ
      </span>
    );
  }

  const digitos = repoeZerosAEsquerda(doc);
  const rotulo = digitos.length === 11 ? "CPF" : digitos.length === 14 ? "CNPJ" : "Doc";
  const ok = isDocumentoValido(doc);

  return (
    <div className="text-xs">
      <Copiavel bruto={digitos || doc} title={`Copiar ${rotulo} (só dígitos)`}>
        <span className="text-muted-foreground">{rotulo}</span>{" "}
        <span className="text-foreground">{formatCpfCnpj(doc)}</span>
        {/* Documento que não tem 11 nem 14 dígitos não é erro de exibição:
            está errado no cadastro e seria colado errado no portal. */}
        {!ok && (
          <span className="font-medium text-amber-600 dark:text-amber-500"> (?)</span>
        )}
      </Copiavel>
    </div>
  );
}

/**
 * Os três dados da usina que o portal da concessionária pede na hora de
 * cadastrar o rateio: código da UC, o código ANTERIOR à migração da RGE
 * (jul/2026 — o portal ainda pede o velho de vez em quando) e o CPF/CNPJ do
 * titular da conta. Ficam no cabeçalho do diálogo, cada um copiável.
 *
 * O que falta aparece como falta, em âmbar: em 22/08/2026 são 3 usinas sem
 * código de UC, 3 sem o antigo e **20 das 29 sem documento** — mostrar em
 * branco esconderia o buraco de cadastro.
 */
function DadosDaUsina({
  uc,
  ucAntiga,
  documento,
}: {
  uc: string | null;
  ucAntiga: string | null;
  documento: string | null;
}) {
  const ucLimpo = uc?.trim() || null;
  const antigaLimpa = ucAntiga?.trim() || null;
  const docLimpo = documento?.trim() || null;
  const docDigitos = repoeZerosAEsquerda(docLimpo);
  const docOk = isDocumentoValido(docLimpo);
  const rotuloDoc =
    docDigitos.length === 11 ? "CPF" : docDigitos.length === 14 ? "CNPJ" : "Documento";

  const faltando = (texto: string) => (
    <span className="font-medium text-amber-600 dark:text-amber-500">{texto}</span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {ucLimpo ? (
        <Copiavel bruto={ucLimpo} title="Copiar código da UC (sem pontuação)">
          UC da usina: <b className="text-foreground">{formatCodigoUc(ucLimpo)}</b>
        </Copiavel>
      ) : (
        faltando("UC da usina não cadastrada")
      )}

      {antigaLimpa ? (
        <Copiavel bruto={antigaLimpa} title="Copiar código antigo (sem pontuação)">
          UC antiga: <b className="text-foreground">{formatCodigoUc(antigaLimpa)}</b>
        </Copiavel>
      ) : (
        faltando("sem código antigo")
      )}

      {docLimpo ? (
        <Copiavel bruto={docDigitos || docLimpo} title={`Copiar ${rotuloDoc} (só dígitos)`}>
          {rotuloDoc}: <b className="text-foreground">{formatCpfCnpj(docLimpo)}</b>
          {/* Documento que não tem 11 nem 14 dígitos não é erro de exibição:
              está errado no cadastro e seria colado errado no portal. */}
          {!docOk && (
            <span className="font-medium text-amber-600 dark:text-amber-500">
              {" "}
              (formato inesperado)
            </span>
          )}
        </Copiavel>
      ) : (
        faltando("titular sem CPF/CNPJ no cadastro")
      )}
    </div>
  );
}

/** "USINA X — Cidade" + o código da UC da usina, quando cadastrado. */
function labelUsina(p: PlantOption) {
  const base = `${p.name}${p.location ? ` — ${p.location}` : ""}`;
  const uc = formatCodigoUc(p.unidadeConsumidora?.trim() || null);
  return uc ? `${base} · UC ${uc}` : base;
}

const MES_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function RateiosPage() {
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(true);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);

  // Período p/ coluna "créditos compensados". Default = mês atual.
  const hoje = useMemo(() => new Date(), []);
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);

  const [data, setData] = useState<RateioResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Rateio | null>(null);
  const [actionBusy, setActionBusy] = useState<
    "enviar" | "aceitar" | "rejeitar" | null
  >(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingPlants(true);
    fetch("/api/plants")
      .then((r) => r.json())
      .then(
        (
          rows: Array<{
            id: string;
            name: string;
            location: string | null;
            unidadeConsumidora: string | null;
          }>,
        ) => {
          setPlants(
            rows.map((p) => ({
              id: p.id,
              name: p.name,
              location: p.location,
              unidadeConsumidora: p.unidadeConsumidora ?? null,
            })),
          );
        },
      )
      .catch(() => {})
      .finally(() => setLoadingPlants(false));
  }, []);

  const loadData = useCallback(
    async (plantId: string, anoVal: number, mesVal: number) => {
      setLoadingData(true);
      try {
        const r = await fetch(
          `/api/plants/${plantId}/rateios/vigente?ano=${anoVal}&mes=${mesVal}`,
        );
        if (!r.ok) {
          setData(null);
          return;
        }
        const json = (await r.json()) as RateioResponse;
        setData(json);
      } finally {
        setLoadingData(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedPlantId) loadData(selectedPlantId, ano, mes);
    else setData(null);
  }, [selectedPlantId, ano, mes, loadData]);

  const selectedPlant = useMemo(
    () => plants.find((p) => p.id === selectedPlantId) ?? null,
    [plants, selectedPlantId],
  );

  // ⚠️ Trava pelo que dá para ESCOLHER, não pelo que já está vinculado.
  //
  // Até 22/08/2026 exigia `consumerUnits.length > 0` — UC com `plantId` desta
  // usina no cadastro. Isso travava 10 das 30 usinas ativas (ANDREIA FATIMA
  // ESCOBAR, GABRIEL LINK, os 4 DOMMO...) num círculo fechado: o botão que abre
  // a tela onde se BUSCA a UC só liberava se a UC já estivesse vinculada.
  //
  // O `4edd54b` derrubou a mesma exigência na lista do diálogo e no POST, para
  // que qualquer UC ativa pudesse entrar pelo "+ Adicionar UC" — esta ficou
  // para trás. O diálogo valida o resto sozinho: soma 100% e pelo menos uma UC
  // com percentual.
  const canCreate =
    !!data &&
    !data.pendente &&
    data.unidadesDisponiveis.length > 0;

  async function callVersionAction(
    action: "enviar" | "aceitar" | "rejeitar",
    versionId: string,
    body?: unknown,
  ) {
    if (!selectedPlantId) return;
    setActionBusy(action);
    try {
      const r = await fetch(
        `/api/plants/${selectedPlantId}/rateios/${versionId}/${action}`,
        {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(json.error || `Falha ao ${action}.`);
        return false;
      }
      if (action === "enviar" && json.message) {
        alert(json.message);
      }
      await loadData(selectedPlantId, ano, mes);
      return true;
    } finally {
      setActionBusy(null);
    }
  }

  async function handleEnviar(versionId: string) {
    await callVersionAction("enviar", versionId);
  }

  async function handleAceitar(versionId: string) {
    if (!confirm("Aceitar este rateio? O rateio vigente atual (se houver) será marcado como SUBSTITUIDO.")) return;
    await callVersionAction("aceitar", versionId);
  }

  async function handleRejeitar(versionId: string) {
    const ok = await callVersionAction("rejeitar", versionId, {
      motivo: rejectReason.trim() || undefined,
    });
    if (ok) {
      setRejectOpen(false);
      setRejectReason("");
    }
  }

  async function handleExcluir(versionId: string, status: string) {
    const aviso =
      status === "VIGENTE"
        ? "⚠ Este é o rateio VIGENTE. Ao excluir, a usina fica sem rateio vigente até você criar um novo. Pagamentos futuros pulam o rateio.\n\nConfirma exclusão?"
        : "Excluir permanentemente este rateio? Payables que referenciam essa versão mantêm o histórico de pagamento, só perdem o link pra ela.";
    if (!confirm(aviso)) return;
    if (!selectedPlantId) return;
    setDeletingId(versionId);
    try {
      const r = await fetch(
        `/api/plants/${selectedPlantId}/rateios/${versionId}`,
        { method: "DELETE" },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(j.error || "Falha ao excluir.");
        return;
      }
      await loadData(selectedPlantId, ano, mes);
    } finally {
      setDeletingId(null);
    }
  }

  const blockReason = !data
    ? ""
    : data.pendente
      ? "Já existe um rateio pendente de aceite — aceite ou rejeite antes de criar outro."
      : data.unidadesDisponiveis.length === 0
        ? "Nenhuma unidade consumidora ativa cadastrada para escolher."
        : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Rateios</h1>
        <p className="text-sm text-muted-foreground">
          Percentual dos créditos gerados por cada usina destinado às unidades
          consumidoras.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Selecionar usina e período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingPlants ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando usinas...
            </div>
          ) : plants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma usina cadastrada.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[260px] max-w-md">
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Usina
                </Label>
                <Select
                  value={selectedPlantId ?? ""}
                  onValueChange={(v) => setSelectedPlantId(v || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha uma usina...">
                      {(value: string) => {
                        const p = plants.find((pl) => pl.id === value);
                        if (!p) return "Escolha uma usina...";
                        return labelUsina(p);
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {plants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {labelUsina(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Mês
                </Label>
                <Select
                  value={String(mes)}
                  onValueChange={(v) => setMes(Number(v))}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue>{MES_LABELS[mes - 1]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MES_LABELS.map((label, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Ano
                </Label>
                <Select
                  value={String(ano)}
                  onValueChange={(v) => setAno(Number(v))}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue>{ano}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - i).map(
                      (y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPlantId && (
        <>
          {/* Pendente de aceite */}
          {data?.pendente && (
            <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Rateio pendente de aceite
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionBusy !== null}
                      onClick={() => handleEnviar(data.pendente!.id)}
                      title={
                        data.pendente.enviadoEm
                          ? `Já enviado em ${new Date(
                              data.pendente.enviadoEm,
                            ).toLocaleDateString("pt-BR")} — clique para reenviar`
                          : "Registrar envio à concessionária"
                      }
                    >
                      {actionBusy === "enviar" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      {data.pendente.enviadoEm ? "Reenviar" : "Enviar à concessionária"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={actionBusy !== null}
                      onClick={() => setRejectOpen(true)}
                    >
                      {actionBusy === "rejeitar" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      Rejeitar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={actionBusy !== null}
                      onClick={() => handleAceitar(data.pendente!.id)}
                    >
                      {actionBusy === "aceitar" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Aceitar
                    </Button>
                  </div>
                </div>
                {data.pendente.enviadoEm && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Enviado à concessionária em{" "}
                    <b className="text-foreground">
                      {new Date(data.pendente.enviadoEm).toLocaleDateString("pt-BR")}
                    </b>
                    . Aguardando retorno.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <RateioTable
                  rateio={data.pendente}
                  allUnits={data.consumerUnits}
                  variant="pendente"
                  onDelete={handleExcluir}
                  onEdit={(r) => setEditing(r)}
                  deleting={deletingId === data.pendente.id}
                />
              </CardContent>
            </Card>
          )}

          {/* Vigente */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Rateio vigente
                  {selectedPlant ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      — {selectedPlant.name}
                    </span>
                  ) : null}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {blockReason && (
                    <span className="text-xs text-muted-foreground">
                      {blockReason}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                    disabled={!canCreate}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Criar novo rateio
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingData ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : !data ? (
                <p className="text-sm text-muted-foreground py-6">
                  Erro ao carregar dados.
                </p>
              ) : data.vigente ? (
                <RateioTable
                  rateio={data.vigente}
                  allUnits={data.consumerUnits}
                  variant="vigente"
                  mostrarCompensados
                  onDelete={handleExcluir}
                  onEdit={(r) => setEditing(r)}
                  deleting={deletingId === data.vigente.id}
                />
              ) : (
                <EmptyVigente
                  unitCount={data.consumerUnits.length}
                  disponiveis={data.unidadesDisponiveis.length}
                />
              )}
            </CardContent>
          </Card>

          {/* Histórico — versões anteriores empilhadas, da mais recente pra mais antiga */}
          {data && data.historico.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground">
                  Histórico de versões ({data.historico.length})
                </h2>
              </div>
              {data.historico.map((h) => (
                <Card
                  key={h.id}
                  className={
                    h.status === "REJEITADO"
                      ? "border-destructive/20 opacity-85"
                      : "opacity-85"
                  }
                >
                  <CardContent className="pt-4">
                    <RateioTable
                      rateio={h}
                      allUnits={data.consumerUnits}
                      variant={
                        h.status === "REJEITADO" ? "rejeitado" : "substituido"
                      }
                      onDelete={handleExcluir}
                      deleting={deletingId === h.id}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {data && selectedPlantId && (
        <CreateRateioDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          plantId={selectedPlantId}
          plantName={selectedPlant?.name ?? ""}
          plantUc={data.plant.unidadeConsumidora ?? selectedPlant?.unidadeConsumidora ?? null}
          plantUcAntiga={data.plant.unidadeConsumidoraAntiga}
          plantDoc={data.plant.cpfCnpj}
          consumerUnits={data.consumerUnits}
          unidadesDisponiveis={data.unidadesDisponiveis}
          regraInstalacao={data.plant.regraInstalacao}
          geracaoMediaMensal={data.plant.geracaoMediaMensal}
          onCreated={() => {
            setCreateOpen(false);
            if (selectedPlantId) loadData(selectedPlantId, ano, mes);
          }}
        />
      )}

      {data && selectedPlantId && editing && (
        <EditRateioDialog
          open={true}
          onOpenChange={(v) => !v && setEditing(null)}
          plantId={selectedPlantId}
          plantName={selectedPlant?.name ?? ""}
          plantUc={data.plant.unidadeConsumidora ?? selectedPlant?.unidadeConsumidora ?? null}
          plantUcAntiga={data.plant.unidadeConsumidoraAntiga}
          plantDoc={data.plant.cpfCnpj}
          consumerUnits={data.consumerUnits}
          unidadesDisponiveis={data.unidadesDisponiveis}
          rateio={editing}
          geracaoMediaMensal={data.plant.geracaoMediaMensal}
          onSaved={() => {
            setEditing(null);
            if (selectedPlantId) loadData(selectedPlantId, ano, mes);
          }}
        />
      )}

      {/* Dialog de rejeitar */}
      {data?.pendente && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeitar rateio pendente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                O rateio será marcado como <b>REJEITADO</b>. O rateio vigente
                atual (se houver) permanece válido.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="motivo">Motivo (opcional)</Label>
                <Textarea
                  id="motivo"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ex.: concessionária apontou inconsistência no % da UC X"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectOpen(false)}
                disabled={actionBusy === "rejeitar"}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => handleRejeitar(data.pendente!.id)}
                disabled={actionBusy === "rejeitar"}
              >
                {actionBusy === "rejeitar" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Rejeitando...
                  </>
                ) : (
                  "Confirmar rejeição"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function formatKwh(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;
}

function RateioTable({
  rateio,
  allUnits,
  variant,
  mostrarCompensados,
  onDelete,
  onEdit,
  deleting,
}: {
  rateio: Rateio;
  allUnits: ConsumerUnitLite[];
  variant: "vigente" | "pendente" | "substituido" | "rejeitado";
  mostrarCompensados?: boolean;
  onDelete?: (versionId: string, status: string) => void;
  onEdit?: (rateio: Rateio) => void;
  deleting?: boolean;
}) {
  const somaPct = rateio.items.reduce((s, i) => s + i.percentual, 0);
  // UC de maior consumo do rateio: linha em verde e tag ÂNCORA.
  const ancoras = idsAncora(
    rateio.items.map((i) => ({
      id: i.consumerUnit.id,
      consumoMedio: i.consumerUnit.consumoMedio,
      consumoReal: i.consumerUnit.consumoReal,
      isGeradora: i.consumerUnit.isGeradora,
    })),
  );
  const somaCompensados = rateio.items.reduce(
    (s, i) => s + (i.creditosCompensadosKwh ?? 0),
    0,
  );
  const algumComDado = rateio.items.some(
    (i) => i.creditosCompensadosKwh != null,
  );
  const unitsInRateio = new Set(rateio.items.map((i) => i.consumerUnit.id));
  const foraDoRateio = allUnits.filter((u) => !unitsInRateio.has(u.id));

  const badge =
    variant === "vigente" ? (
      <Badge variant="default">Vigente</Badge>
    ) : variant === "pendente" ? (
      <Badge variant="secondary">Pendente de aceite</Badge>
    ) : variant === "substituido" ? (
      <Badge variant="secondary">Substituído</Badge>
    ) : (
      <Badge variant="destructive">Rejeitado</Badge>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {badge}
        {rateio.protocolo ? (
          <span>
            Protocolo{" "}
            <b className="text-foreground">{rateio.protocolo}</b>
          </span>
        ) : (
          // Ausência de protocolo não passa calada: é rateio antigo (antes de
          // 22/08/2026) ou criado fora da tela. Aparece pra alguém preencher
          // pela edição.
          <span className="font-medium text-amber-600 dark:text-amber-500">
            Sem protocolo
          </span>
        )}
        <span>
          Vigente desde{" "}
          <b className="text-foreground">
            {new Date(rateio.vigenteAPartirDe).toLocaleDateString("pt-BR")}
          </b>
        </span>
        <span>
          Criado em{" "}
          <b className="text-foreground">
            {new Date(rateio.criadoEm).toLocaleDateString("pt-BR")}
          </b>
        </span>
        {rateio.aceitoEm && (
          <span>
            Aceito em{" "}
            <b className="text-foreground">
              {new Date(rateio.aceitoEm).toLocaleDateString("pt-BR")}
            </b>
          </span>
        )}
        {variant === "rejeitado" && rateio.rejeitadoEm && (
          <span>
            Rejeitado em{" "}
            <b className="text-foreground">
              {new Date(rateio.rejeitadoEm).toLocaleDateString("pt-BR")}
            </b>
          </span>
        )}
        <span>
          {rateio.items.length} UC{rateio.items.length > 1 ? "s" : ""}
        </span>
        <span>
          Soma:{" "}
          <b
            className={
              Math.abs(somaPct - 100) < 0.01
                ? "text-foreground"
                : "text-destructive"
            }
          >
            {somaPct.toFixed(2)}%
          </b>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(rateio)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-foreground hover:bg-muted"
              title="Editar percentuais e dados deste rateio"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() =>
                onDelete(rateio.id, variant === "vigente" ? "VIGENTE" : rateio.status)
              }
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              title="Excluir rateio permanentemente"
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Excluir
            </button>
          )}
        </div>
      </div>

      {rateio.observacao && (
        <p className="text-sm text-muted-foreground italic">
          &ldquo;{rateio.observacao}&rdquo;
        </p>
      )}

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground bg-muted/30">
              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                Unidade Consumidora
              </th>
              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                UC
              </th>
              <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                CPF/CNPJ
              </th>
              <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">
                Percentual
              </th>
              {mostrarCompensados && (
                <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">
                  Créditos Compensados
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rateio.items.map((item) => (
              <tr
                key={item.id}
                className={`border-b last:border-0 ${
                  ancoras.has(item.consumerUnit.id) ? LINHA_ANCORA : ""
                }`}
              >
                <td className="py-2.5 px-3 font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {item.consumerUnit.nome}
                    {ancoras.has(item.consumerUnit.id) && <TagAncora />}
                  </span>
                </td>
                <td className="py-2.5 px-3 align-top">
                  <CodigosUc
                    codigoUc={item.consumerUnit.codigoUc}
                    codigoUcAntigo={item.consumerUnit.codigoUcAntigo}
                  />
                </td>
                <td className="py-2.5 px-3 align-top">
                  <DocumentoUc cpfCnpj={item.consumerUnit.cpfCnpj} />
                </td>
                <td className="py-2.5 px-3 text-right font-medium">
                  {item.percentual.toFixed(2)}%
                </td>
                {mostrarCompensados && (
                  <td className="py-2.5 px-3 text-right">
                    {item.creditosCompensadosKwh != null ? (
                      <span className="font-medium">
                        {formatKwh(item.creditosCompensadosKwh)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        sem fatura
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {mostrarCompensados && algumComDado && (
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold">
                <td className="py-2.5 px-3" colSpan={3}>
                  Total compensado
                </td>
                <td className="py-2.5 px-3 text-right">{somaPct.toFixed(2)}%</td>
                <td className="py-2.5 px-3 text-right">
                  {formatKwh(somaCompensados)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {foraDoRateio.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <b className="text-foreground">{foraDoRateio.length}</b> unidade
          {foraDoRateio.length > 1 ? "s" : ""} vinculada
          {foraDoRateio.length > 1 ? "s" : ""} à usina, mas fora deste rateio:{" "}
          {foraDoRateio.map((u) => u.nome).join(", ")}
        </div>
      )}
    </div>
  );
}

function EmptyVigente({
  unitCount,
  disponiveis,
}: {
  unitCount: number;
  /** UCs ativas que o "+ Adicionar UC" oferece — 0 vinculadas não impede nada. */
  disponiveis: number;
}) {
  return (
    <div className="py-8 text-center space-y-2">
      <p className="text-sm text-muted-foreground">
        Nenhum rateio vigente para esta usina.
      </p>
      <p className="text-xs text-muted-foreground">
        {unitCount > 0
          ? `${unitCount} unidade${unitCount > 1 ? "s" : ""} vinculada${
              unitCount > 1 ? "s" : ""
            } à usina aguardando configuração de rateio.`
          : disponiveis > 0
            ? // Nada vinculado no cadastro não é impedimento desde o "+ Adicionar
              // UC": o rateio busca entre todas as UCs ativas.
              `Nenhuma UC vinculada a ela no cadastro — use "Criar novo rateio" e busque entre as ${disponiveis} unidades ativas.`
            : "Não há unidades consumidoras ativas cadastradas."}
      </p>
    </div>
  );
}

function CreateRateioDialog({
  open,
  onOpenChange,
  plantId,
  plantName,
  plantUc,
  plantUcAntiga,
  plantDoc,
  consumerUnits,
  unidadesDisponiveis,
  regraInstalacao,
  geracaoMediaMensal,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  plantName: string;
  plantUc: string | null;
  plantUcAntiga: string | null;
  plantDoc: string | null;
  consumerUnits: ConsumerUnitLite[];
  unidadesDisponiveis: UnidadeDisponivel[];
  regraInstalacao: string | null;
  geracaoMediaMensal: number | null;
  onCreated: () => void;
}) {
  // UC geradora sempre entra no rateio com 0% fixo, independente da regra:
  // a concessionária compensa primeiro no medidor da geradora, só o que sobra
  // vira crédito pro rateio. DESCONTADO só muda a cobrança da UC (fluxo
  // separado), não o % dela no rateio.
  const geradoraFixa0 = true;
  // As UCs que estão NO rateio sendo montado. Começa pelas da usina e cresce
  // pelo "+ Adicionar UC" — antes de 22/08/2026 era fixa nas da usina.
  const [linhas, setLinhas] = useState<UnidadeDisponivel[]>([]);
  const [percents, setPercents] = useState<Record<string, string>>({});
  // "auto" = os percentuais acompanham a sugestão a cada UC que entra ou sai.
  // Vai para "manual" no primeiro número digitado ou no botão "Editar".
  const [modoSugestao, setModoSugestao] = useState<ModoSugestao>("auto");
  const [observacao, setObservacao] = useState("");
  const [vigenteAPartirDe, setVigenteAPartirDe] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Segunda janela (pequena): o nº de protocolo que a concessionária devolve
  // ao registrar o rateio no portal dela. Só depois dela o POST sai.
  const [protocoloOpen, setProtocoloOpen] = useState(false);
  const [protocolo, setProtocolo] = useState("");

  useEffect(() => {
    if (open) {
      // Estado inicial = as UCs já vinculadas à usina, como sempre foi. O
      // seletor só ACRESCENTA; ninguém perde o ponto de partida de antes.
      const iniciais = unidadesDisponiveis.filter((u) => u.daUsina);
      setLinhas(iniciais);

      const initial: Record<string, string> = {};
      iniciais.forEach((u) => {
        // UC geradora em regra DEDICADA/PROPRIO já entra com 0%.
        // Em DESCONTADO fica vazio pro usuário preencher.
        if (u.isGeradora && geradoraFixa0) {
          initial[u.id] = "0";
        } else {
          initial[u.id] = "";
        }
      });
      setPercents(initial);
      // Toda abertura recomeça sugerindo; o efeito abaixo preenche os campos.
      setModoSugestao("auto");
      setObservacao("");
      // Default = hoje no formato YYYY-MM-DD (input[type=date])
      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = String(hoje.getMonth() + 1).padStart(2, "0");
      const d = String(hoje.getDate()).padStart(2, "0");
      setVigenteAPartirDe(`${y}-${m}-${d}`);
      setProtocolo("");
      setProtocoloOpen(false);
      setError(null);
    }
  }, [open, unidadesDisponiveis, geradoraFixa0]);

  // Sugestão pelo consumo médio das UCs na tela (valores de contrato).
  const sugestao = useMemo(
    () => sugerirPercentuais(linhas, geracaoMediaMensal),
    [linhas, geracaoMediaMensal],
  );

  // Em "auto" os percentuais na tela SÃO a sugestão: entrou ou saiu UC, os
  // números se refazem sozinhos. Nunca sobrescreve depois que o usuário
  // assumiu o controle — isso é o que separa "auto" de "manual".
  useEffect(() => {
    if (!open || modoSugestao !== "auto" || sugestao.indisponivel) return;
    setPercents(sugestaoComoTexto(sugestao));
  }, [open, modoSugestao, sugestao]);

  const sugPorId = useMemo(
    () => new Map(sugestao.linhas.map((l) => [l.id, l])),
    [sugestao],
  );

  // UC de maior consumo entre as que estão NA TELA: refaz a cada UC que entra
  // ou sai, como os percentuais.
  const ancoras = useMemo(() => idsAncora(linhas), [linhas]);

  // Soma só o que está NA TELA: percentual de linha removida não pode
  // continuar entrando na conta.
  const soma = useMemo(() => {
    return linhas.reduce((s, u) => {
      const n = parseFloat((percents[u.id] ?? "").replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [percents, linhas]);

  const somaOk = Math.abs(soma - 100) < 0.01;

  function distribuirIgual() {
    const n = linhas.length;
    if (n === 0) return;
    // Divisão por cabeça é uma escolha do usuário: sai do modo sugestão, senão
    // a próxima UC adicionada desfaria o clique sem aviso.
    setModoSugestao("manual");
    const base = Math.floor((100 / n) * 100) / 100;
    const resto = Math.round((100 - base * n) * 100) / 100;
    const next: Record<string, string> = {};
    linhas.forEach((u, i) => {
      const v = i === 0 ? base + resto : base;
      next[u.id] = v.toFixed(2);
    });
    setPercents(next);
  }

  function adicionar(u: UnidadeDisponivel) {
    setLinhas((atual) => (atual.some((l) => l.id === u.id) ? atual : [...atual, u]));
    setPercents((p) => ({ ...p, [u.id]: u.isGeradora && geradoraFixa0 ? "0" : "" }));
  }

  function remover(id: string) {
    setLinhas((atual) => atual.filter((l) => l.id !== id));
    // Tira o percentual junto: linha fora da tela não pode continuar somando.
    setPercents((p) => {
      const { [id]: _, ...resto } = p;
      return resto;
    });
  }

  function montarItems() {
    const geradoraIds = new Set(
      linhas.filter((u) => u.isGeradora).map((u) => u.id),
    );
    return linhas
      .map((u) => {
        const percentual = parseFloat((percents[u.id] ?? "").replace(",", "."));
        return { consumerUnitId: u.id, percentual };
      })
      // Mantém UC geradora mesmo com 0% (regra RGE). Outras UCs com 0 ou vazio são ignoradas.
      .filter(
        (it) =>
          Number.isFinite(it.percentual) &&
          (it.percentual > 0 || geradoraIds.has(it.consumerUnitId)),
      );
  }

  /**
   * "Criar rateio" NÃO salva direto: confere o que dá pra conferir aqui e só
   * então abre a janela do protocolo. Assim o usuário não descobre um erro de
   * percentual depois de já ter digitado o número da concessionária.
   */
  function abrirProtocolo() {
    setError(null);

    if (montarItems().length === 0) {
      setError("Informe o percentual de pelo menos uma UC.");
      return;
    }
    if (!somaOk) {
      setError(`A soma dos percentuais precisa ser 100% (atual: ${soma.toFixed(2)}%).`);
      return;
    }
    if (!vigenteAPartirDe) {
      setError("Informe a data de início de vigência.");
      return;
    }
    setProtocoloOpen(true);
  }

  async function handleSubmit() {
    setError(null);

    const items = montarItems();
    const protocoloLimpo = protocolo.trim();
    if (!protocoloLimpo) {
      setError("Informe o número de protocolo gerado pela concessionária.");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`/api/plants/${plantId}/rateios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          observacao: observacao.trim() || undefined,
          vigenteAPartirDe,
          protocolo: protocoloLimpo,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        // Erro volta pra janela do protocolo, que é onde o usuário está.
        setError(err.error || "Falha ao criar rateio.");
        return;
      }
      setProtocoloOpen(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo rateio — {plantName}</DialogTitle>
          <DadosDaUsina uc={plantUc} ucAntiga={plantUcAntiga} documento={plantDoc} />
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="max-w-sm text-xs text-muted-foreground">
              Informe o percentual dos créditos destinado a cada UC. UCs com 0
              ou em branco são ignoradas. Soma total deve ser 100%.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={distribuirIgual}
              >
                Distribuir igual
              </Button>
              <AdicionarUc
                unidades={unidadesDisponiveis}
                jaSelecionadas={new Set(linhas.map((l) => l.id))}
                onAdicionar={adicionar}
              />
            </div>
          </div>

          <SugestaoPercentuais
            sugestao={sugestao}
            modo={modoSugestao}
            totalUcs={linhas.length}
            onAceitar={() => {
              setPercents(sugestaoComoTexto(sugestao));
              setModoSugestao("manual");
            }}
            onEditar={() => setModoSugestao("manual")}
          />

          <div className="overflow-x-auto border rounded-lg max-h-[45vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    Unidade
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    UC
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    CPF/CNPJ
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide w-32">
                    %
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma UC no rateio. Use <b>&ldquo;Adicionar UC&rdquo;</b> para buscar
                      por nome ou código.
                    </td>
                  </tr>
                )}
                {linhas.map((u) => {
                  const isGeradoraFixa = u.isGeradora && geradoraFixa0;
                  const sug = sugPorId.get(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={`border-b last:border-0 ${
                        ancoras.has(u.id) ? LINHA_ANCORA : ""
                      }`}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{u.nome}</span>
                          {ancoras.has(u.id) && <TagAncora />}
                          {u.isGeradora && (
                            <Badge variant="outline" className="text-[10px]">
                              Geradora
                            </Badge>
                          )}
                          {!u.daUsina && (
                            <Badge variant="secondary" className="text-[10px]">
                              De fora da usina
                            </Badge>
                          )}
                        </div>
                        {u.isGeradora ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            0% fixo (concessionária compensa no medidor da geradora)
                          </p>
                        ) : (
                          <ConsumosDaUc
                            contrato={u.consumoMedio}
                            real={u.consumoReal}
                            meses={u.consumoRealMeses}
                            origem={sug?.origemConsumo ?? null}
                          />
                        )}
                        {/* O conflito não impede salvar — mas não passa calado. */}
                        {u.comprometida && (
                          <p className="mt-0.5 text-[11px] font-medium text-red-600">
                            Já recebe{" "}
                            {u.comprometida.percentual.toFixed(2).replace(".", ",")}% do rateio{" "}
                            {u.comprometida.status === "VIGENTE" ? "vigente" : "pendente"} de{" "}
                            {u.comprometida.plantName}
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-3 align-top">
                        <CodigosUc
                          codigoUc={u.codigoUc}
                          codigoUcAntigo={u.codigoUcAntigo}
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <DocumentoUc cpfCnpj={u.cpfCnpj} />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={percents[u.id] ?? ""}
                          onChange={(e) => {
                            // Digitou = assumiu o controle. Sem isto, a próxima
                            // UC adicionada apagaria o número calado.
                            setModoSugestao("manual");
                            setPercents((p) => ({ ...p, [u.id]: e.target.value }));
                          }}
                          disabled={isGeradoraFixa}
                          className="text-right"
                        />
                        {/* Só aparece depois que o usuário assumiu: em "auto" o
                            campo já É a sugestão, repetir seria ruído. */}
                        {!isGeradoraFixa &&
                          modoSugestao === "manual" &&
                          sug?.contabilizada && (
                            <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                              sugerido {sug.percentual.toFixed(2).replace(".", ",")}%
                              {sug.kwhDestinado !== null
                                ? ` · ${sug.kwhDestinado.toLocaleString("pt-BR", {
                                    maximumFractionDigits: 0,
                                  })} kWh`
                                : ""}
                            </p>
                          )}
                      </td>
                      <td className="py-2 pr-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remover(u.id)}
                          title="Tirar do rateio"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span
              className={
                somaOk ? "font-semibold" : "font-semibold text-destructive"
              }
            >
              {soma.toFixed(2)}%{somaOk ? " ✓" : ""}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vigenteAPartirDe">Vigente a partir de</Label>
            <Input
              id="vigenteAPartirDe"
              type="date"
              value={vigenteAPartirDe}
              onChange={(e) => setVigenteAPartirDe(e.target.value)}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              Data em que este rateio passa a valer. Pode ser retroativa (pra
              reprocessar faturas antigas) ou futura (pra agendar entrada em
              vigor).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacao">Observação (opcional)</Label>
            <Textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: revisão solicitada pelo cliente em abril/2026"
              rows={2}
            />
          </div>

          {/* Enquanto a janela do protocolo está aberta, o erro aparece lá. */}
          {error && !protocoloOpen && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={abrirProtocolo} disabled={saving || !somaOk}>
            Criar rateio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Janela pequena: nº de protocolo da concessionária. É o último passo —
        o rateio só é criado depois dele. */}
    <Dialog
      open={protocoloOpen}
      onOpenChange={(v) => {
        // Não deixa fechar no meio do POST — senão o usuário não vê o
        // resultado e não sabe se o rateio entrou.
        if (saving) return;
        setProtocoloOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Protocolo da concessionária</DialogTitle>
          {/* O operador está com o portal da concessionária aberto neste
              momento — o código da UC segue à mão aqui também. */}
          <DadosDaUsina uc={plantUc} ucAntiga={plantUcAntiga} documento={plantDoc} />
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Informe o número de protocolo gerado pela companhia de energia ao
            registrar este rateio. Ele fica gravado junto do rateio.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="protocolo-novo">Número do protocolo</Label>
            <Input
              id="protocolo-novo"
              autoFocus
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && protocolo.trim() && !saving) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ex.: 2026081234567"
              maxLength={60}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setProtocoloOpen(false)}
            disabled={saving}
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !protocolo.trim()}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              "Confirmar e criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function EditRateioDialog({
  open,
  onOpenChange,
  plantId,
  plantName,
  plantUc,
  plantUcAntiga,
  plantDoc,
  consumerUnits,
  unidadesDisponiveis,
  rateio,
  geracaoMediaMensal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  plantName: string;
  plantUc: string | null;
  plantUcAntiga: string | null;
  plantDoc: string | null;
  consumerUnits: ConsumerUnitLite[];
  unidadesDisponiveis: UnidadeDisponivel[];
  rateio: Rateio;
  geracaoMediaMensal: number | null;
  onSaved: () => void;
}) {
  const [linhas, setLinhas] = useState<UnidadeDisponivel[]>([]);
  const [percents, setPercents] = useState<Record<string, string>>({});
  // ⚠️ Aqui começa em "manual", ao contrário do rateio novo: a versão já tem
  // percentuais gravados e reescrevê-los na abertura trocaria o que está
  // valendo sem ninguém pedir. A sugestão fica à mão, no botão.
  const [modoSugestao, setModoSugestao] = useState<ModoSugestao>("manual");
  const [observacao, setObservacao] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [vigenteAPartirDe, setVigenteAPartirDe] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Linhas = quem JÁ está no rateio (inclusive UC de fora da usina, que
      // passou a ser possível em 22/08/2026) + as UCs da usina, que continuam
      // aparecendo em branco como antes.
      const porId = new Map(unidadesDisponiveis.map((u) => [u.id, u]));
      const doRateio: UnidadeDisponivel[] = rateio.items.map(
        (i) => porId.get(i.consumerUnit.id) ?? { ...i.consumerUnit, daUsina: false },
      );
      const daUsinaForaDoRateio = unidadesDisponiveis.filter(
        (u) => u.daUsina && !rateio.items.some((i) => i.consumerUnit.id === u.id),
      );
      setLinhas([...doRateio, ...daUsinaForaDoRateio]);

      const initial: Record<string, string> = {};
      // Pré-popular com os valores existentes; UCs não no rateio = vazio.
      [...doRateio, ...daUsinaForaDoRateio].forEach((u) => {
        const existing = rateio.items.find((i) => i.consumerUnit.id === u.id);
        initial[u.id] = existing ? existing.percentual.toFixed(2) : "";
      });
      setPercents(initial);
      setObservacao(rateio.observacao ?? "");
      setProtocolo(rateio.protocolo ?? "");
      const d = new Date(rateio.vigenteAPartirDe);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setVigenteAPartirDe(`${y}-${m}-${dd}`);
      setModoSugestao("manual");
      setError(null);
    }
  }, [open, unidadesDisponiveis, rateio]);

  const sugestao = useMemo(
    () => sugerirPercentuais(linhas, geracaoMediaMensal),
    [linhas, geracaoMediaMensal],
  );
  const sugPorId = useMemo(
    () => new Map(sugestao.linhas.map((l) => [l.id, l])),
    [sugestao],
  );

  // UC de maior consumo entre as que estão NA TELA: refaz a cada UC que entra
  // ou sai, como os percentuais.
  const ancoras = useMemo(() => idsAncora(linhas), [linhas]);

  useEffect(() => {
    if (!open || modoSugestao !== "auto" || sugestao.indisponivel) return;
    setPercents(sugestaoComoTexto(sugestao));
  }, [open, modoSugestao, sugestao]);

  const soma = useMemo(() => {
    return linhas.reduce((s, u) => {
      const n = parseFloat((percents[u.id] ?? "").replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [percents, linhas]);

  const somaOk = Math.abs(soma - 100) < 0.01;
  const isVigente = rateio.status === "VIGENTE";

  function adicionar(u: UnidadeDisponivel) {
    setLinhas((atual) => (atual.some((l) => l.id === u.id) ? atual : [...atual, u]));
    setPercents((p) => ({ ...p, [u.id]: "" }));
  }

  function remover(id: string) {
    setLinhas((atual) => atual.filter((l) => l.id !== id));
    setPercents((p) => {
      const { [id]: _, ...resto } = p;
      return resto;
    });
  }

  async function handleSubmit() {
    setError(null);
    const geradoraIds = new Set(
      linhas.filter((u) => u.isGeradora).map((u) => u.id),
    );
    const items = linhas
      .map((u) => ({
        consumerUnitId: u.id,
        percentual: parseFloat((percents[u.id] ?? "").replace(",", ".")),
      }))
      .filter(
        (it) =>
          Number.isFinite(it.percentual) &&
          (it.percentual > 0 || geradoraIds.has(it.consumerUnitId)),
      );

    if (items.length === 0) {
      setError("Informe o percentual de pelo menos uma UC.");
      return;
    }
    if (!somaOk) {
      setError(`Soma deve ser 100% (atual: ${soma.toFixed(2)}%).`);
      return;
    }
    if (!vigenteAPartirDe) {
      setError("Informe a data de vigência.");
      return;
    }
    // Rateio que já tinha protocolo não pode perdê-lo. O que nasceu sem
    // (antes de 22/08/2026) segue editável sem protocolo.
    if (rateio.protocolo && !protocolo.trim()) {
      setError("Informe o número de protocolo gerado pela concessionária.");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`/api/plants/${plantId}/rateios/${rateio.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          observacao: observacao.trim() || null,
          protocolo: protocolo.trim() || null,
          vigenteAPartirDe,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setError(err.error || "Falha ao salvar.");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar rateio — {plantName}</DialogTitle>
          <DadosDaUsina uc={plantUc} ucAntiga={plantUcAntiga} documento={plantDoc} />
        </DialogHeader>

        <div className="space-y-4">
          {isVigente && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
              ⚠ Este é o rateio <b>VIGENTE</b>. Edição direta NÃO recalcula
              automaticamente os payables já criados (eles preservam o snapshot
              do contrato no momento). Se a correção precisa refletir nos
              payables, rode o re-cálculo do cap depois.
            </div>
          )}

          <div className="flex justify-end">
            <AdicionarUc
              unidades={unidadesDisponiveis}
              jaSelecionadas={new Set(linhas.map((l) => l.id))}
              onAdicionar={adicionar}
            />
          </div>

          <SugestaoPercentuais
            sugestao={sugestao}
            modo={modoSugestao}
            totalUcs={linhas.length}
            onAceitar={() => {
              setPercents(sugestaoComoTexto(sugestao));
              setModoSugestao("auto");
            }}
            onEditar={() => setModoSugestao("manual")}
          />

          <div className="overflow-x-auto border rounded-lg max-h-[45vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    Unidade
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    UC
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">
                    CPF/CNPJ
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide w-32">
                    %
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma UC no rateio. Use <b>&ldquo;Adicionar UC&rdquo;</b> para buscar
                      por nome ou código.
                    </td>
                  </tr>
                )}
                {linhas.map((u) => {
                  const sug = sugPorId.get(u.id);
                  return (
                  <tr
                    key={u.id}
                    className={`border-b last:border-0 ${
                      ancoras.has(u.id) ? LINHA_ANCORA : ""
                    }`}
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{u.nome}</span>
                        {ancoras.has(u.id) && <TagAncora />}
                        {u.isGeradora && (
                          <Badge variant="outline" className="text-[10px]">
                            Geradora
                          </Badge>
                        )}
                        {u.daUsina === false && (
                          <Badge variant="secondary" className="text-[10px]">
                            De fora da usina
                          </Badge>
                        )}
                      </div>
                      {!u.isGeradora && (
                        <ConsumosDaUc
                          contrato={u.consumoMedio}
                          real={u.consumoReal}
                          meses={u.consumoRealMeses}
                          origem={sug?.origemConsumo ?? null}
                        />
                      )}
                      {u.comprometida && (
                        <p className="mt-0.5 text-[11px] font-medium text-red-600">
                          Já recebe {u.comprometida.percentual.toFixed(2).replace(".", ",")}% do
                          rateio {u.comprometida.status === "VIGENTE" ? "vigente" : "pendente"} de{" "}
                          {u.comprometida.plantName}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-3 align-top">
                        <CodigosUc
                          codigoUc={u.codigoUc}
                          codigoUcAntigo={u.codigoUcAntigo}
                        />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <DocumentoUc cpfCnpj={u.cpfCnpj} />
                      </td>
                    <td className="py-2 px-3">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={percents[u.id] ?? ""}
                        onChange={(e) => {
                          setModoSugestao("manual");
                          setPercents((p) => ({ ...p, [u.id]: e.target.value }));
                        }}
                        className="text-right"
                      />
                      {modoSugestao === "manual" && sug?.contabilizada && (
                        <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                          sugerido {sug.percentual.toFixed(2).replace(".", ",")}%
                          {sug.kwhDestinado !== null
                            ? ` · ${sug.kwhDestinado.toLocaleString("pt-BR", {
                                maximumFractionDigits: 0,
                              })} kWh`
                            : ""}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remover(u.id)}
                        title="Tirar do rateio"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span
              className={
                somaOk ? "font-semibold" : "font-semibold text-destructive"
              }
            >
              {soma.toFixed(2)}%{somaOk ? " ✓" : ""}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vigenteAPartirDe-edit">Vigente a partir de</Label>
            <Input
              id="vigenteAPartirDe-edit"
              type="date"
              value={vigenteAPartirDe}
              onChange={(e) => setVigenteAPartirDe(e.target.value)}
              className="max-w-[200px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="protocolo-edit">Protocolo da concessionária</Label>
            <Input
              id="protocolo-edit"
              value={protocolo}
              onChange={(e) => setProtocolo(e.target.value)}
              placeholder="Ex.: 2026081234567"
              maxLength={60}
              className="max-w-[260px]"
            />
            {!rateio.protocolo && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Este rateio foi criado sem protocolo. Preencha se tiver o número.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacao-edit">Observação (opcional)</Label>
            <Textarea
              id="observacao-edit"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !somaOk}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar alterações"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
