"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
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

interface PlantOption {
  id: string;
  name: string;
  location: string | null;
}

interface ConsumerUnitLite {
  id: string;
  nome: string;
  codigoUc: string | null;
  cidade: string | null;
  distribuidora: string | null;
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
  vigenteAPartirDe: string;
  criadoEm: string;
  enviadoEm: string | null;
  aceitoEm: string | null;
  rejeitadoEm: string | null;
  items: RateioItem[];
}

interface RateioResponse {
  plant: { id: string; name: string; regraInstalacao: string | null };
  periodo: { ano: number; mes: number } | null;
  vigente: Rateio | null;
  pendente: Rateio | null;
  historico: Rateio[];
  consumerUnits: ConsumerUnitLite[];
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
      .then((rows: Array<{ id: string; name: string; location: string | null }>) => {
        setPlants(
          rows.map((p) => ({ id: p.id, name: p.name, location: p.location })),
        );
      })
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

  const canCreate =
    !!data &&
    !data.pendente &&
    data.consumerUnits.length > 0;

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
      : data.consumerUnits.length === 0
        ? "Nenhuma unidade consumidora vinculada a esta usina."
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
                        return `${p.name}${p.location ? ` — ${p.location}` : ""}`;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {plants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {`${p.name}${p.location ? ` — ${p.location}` : ""}`}
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
                <EmptyVigente unitCount={data.consumerUnits.length} />
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
          consumerUnits={data.consumerUnits}
          regraInstalacao={data.plant.regraInstalacao}
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
          consumerUnits={data.consumerUnits}
          rateio={editing}
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
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2.5 px-3 font-medium">
                  {item.consumerUnit.nome}
                </td>
                <td className="py-2.5 px-3 text-xs">
                  {item.consumerUnit.codigoUc ?? "-"}
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
                <td className="py-2.5 px-3" colSpan={2}>
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

function EmptyVigente({ unitCount }: { unitCount: number }) {
  return (
    <div className="py-8 text-center space-y-2">
      <p className="text-sm text-muted-foreground">
        Nenhum rateio vigente para esta usina.
      </p>
      <p className="text-xs text-muted-foreground">
        {unitCount === 0
          ? "Também não há unidades consumidoras vinculadas a ela."
          : `${unitCount} unidade${unitCount > 1 ? "s" : ""} vinculada${
              unitCount > 1 ? "s" : ""
            } à usina aguardando configuração de rateio.`}
      </p>
    </div>
  );
}

function CreateRateioDialog({
  open,
  onOpenChange,
  plantId,
  plantName,
  consumerUnits,
  regraInstalacao,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  plantName: string;
  consumerUnits: ConsumerUnitLite[];
  regraInstalacao: string | null;
  onCreated: () => void;
}) {
  // UC geradora sempre entra no rateio com 0% fixo, independente da regra:
  // a concessionária compensa primeiro no medidor da geradora, só o que sobra
  // vira crédito pro rateio. DESCONTADO só muda a cobrança da UC (fluxo
  // separado), não o % dela no rateio.
  const geradoraFixa0 = true;
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState("");
  const [vigenteAPartirDe, setVigenteAPartirDe] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      consumerUnits.forEach((u) => {
        // UC geradora em regra DEDICADA/PROPRIO já entra com 0%.
        // Em DESCONTADO fica vazio pro usuário preencher.
        if (u.isGeradora && geradoraFixa0) {
          initial[u.id] = "0";
        } else {
          initial[u.id] = "";
        }
      });
      setPercents(initial);
      setObservacao("");
      // Default = hoje no formato YYYY-MM-DD (input[type=date])
      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = String(hoje.getMonth() + 1).padStart(2, "0");
      const d = String(hoje.getDate()).padStart(2, "0");
      setVigenteAPartirDe(`${y}-${m}-${d}`);
      setError(null);
    }
  }, [open, consumerUnits, geradoraFixa0]);

  const soma = useMemo(() => {
    return Object.values(percents).reduce((s, v) => {
      const n = parseFloat(v.replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [percents]);

  const somaOk = Math.abs(soma - 100) < 0.01;

  function distribuirIgual() {
    const n = consumerUnits.length;
    if (n === 0) return;
    const base = Math.floor((100 / n) * 100) / 100;
    const resto = Math.round((100 - base * n) * 100) / 100;
    const next: Record<string, string> = {};
    consumerUnits.forEach((u, i) => {
      const v = i === 0 ? base + resto : base;
      next[u.id] = v.toFixed(2);
    });
    setPercents(next);
  }

  async function handleSubmit() {
    setError(null);

    const geradoraIds = new Set(
      consumerUnits.filter((u) => u.isGeradora).map((u) => u.id),
    );
    const items = Object.entries(percents)
      .map(([consumerUnitId, raw]) => {
        const percentual = parseFloat(raw.replace(",", "."));
        return { consumerUnitId, percentual };
      })
      // Mantém UC geradora mesmo com 0% (regra RGE). Outras UCs com 0 ou vazio são ignoradas.
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
      setError(`A soma dos percentuais precisa ser 100% (atual: ${soma.toFixed(2)}%).`);
      return;
    }
    if (!vigenteAPartirDe) {
      setError("Informe a data de início de vigência.");
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
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setError(err.error || "Falha ao criar rateio.");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo rateio — {plantName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Informe o percentual dos créditos destinado a cada UC. UCs com 0
              ou em branco são ignoradas. Soma total deve ser 100%.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={distribuirIgual}
            >
              Distribuir igual
            </Button>
          </div>

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
                  <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide w-32">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {consumerUnits.map((u) => {
                  const isGeradoraFixa = u.isGeradora && geradoraFixa0;
                  return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{u.nome}</span>
                          {u.isGeradora && (
                            <Badge variant="outline" className="text-[10px]">
                              Geradora
                            </Badge>
                          )}
                        </div>
                        {u.isGeradora && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            0% fixo (concessionária compensa no medidor da geradora)
                          </p>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs">{u.codigoUc ?? "-"}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={percents[u.id] ?? ""}
                          onChange={(e) =>
                            setPercents((p) => ({ ...p, [u.id]: e.target.value }))
                          }
                          disabled={isGeradoraFixa}
                          className="text-right"
                        />
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
              "Criar rateio"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRateioDialog({
  open,
  onOpenChange,
  plantId,
  plantName,
  consumerUnits,
  rateio,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plantId: string;
  plantName: string;
  consumerUnits: ConsumerUnitLite[];
  rateio: Rateio;
  onSaved: () => void;
}) {
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState("");
  const [vigenteAPartirDe, setVigenteAPartirDe] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      // Pré-popular com os valores existentes; UCs não no rateio = vazio.
      consumerUnits.forEach((u) => {
        const existing = rateio.items.find((i) => i.consumerUnit.id === u.id);
        initial[u.id] = existing ? existing.percentual.toFixed(2) : "";
      });
      setPercents(initial);
      setObservacao(rateio.observacao ?? "");
      const d = new Date(rateio.vigenteAPartirDe);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setVigenteAPartirDe(`${y}-${m}-${dd}`);
      setError(null);
    }
  }, [open, consumerUnits, rateio]);

  const soma = useMemo(() => {
    return Object.values(percents).reduce((s, v) => {
      const n = parseFloat(v.replace(",", "."));
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [percents]);

  const somaOk = Math.abs(soma - 100) < 0.01;
  const isVigente = rateio.status === "VIGENTE";

  async function handleSubmit() {
    setError(null);
    const geradoraIds = new Set(
      consumerUnits.filter((u) => u.isGeradora).map((u) => u.id),
    );
    const items = Object.entries(percents)
      .map(([consumerUnitId, raw]) => ({
        consumerUnitId,
        percentual: parseFloat(raw.replace(",", ".")),
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

    setSaving(true);
    try {
      const r = await fetch(`/api/plants/${plantId}/rateios/${rateio.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          observacao: observacao.trim() || null,
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
                  <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide w-32">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {consumerUnits.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{u.nome}</span>
                        {u.isGeradora && (
                          <Badge variant="outline" className="text-[10px]">
                            Geradora
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs">{u.codigoUc ?? "-"}</td>
                    <td className="py-2 px-3">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={percents[u.id] ?? ""}
                        onChange={(e) =>
                          setPercents((p) => ({ ...p, [u.id]: e.target.value }))
                        }
                        className="text-right"
                      />
                    </td>
                  </tr>
                ))}
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
