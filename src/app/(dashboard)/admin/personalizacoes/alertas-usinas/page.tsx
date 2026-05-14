"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Loader2,
  Save,
  ShieldAlert,
  Thermometer,
  WifiOff,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TipoAlerta =
  | "BAIXA_GERACAO"
  | "OFFLINE"
  | "TENSAO_FORA"
  | "TEMPERATURA_INVERSOR"
  | "FREQUENCIA_REDE";
type Severidade = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

interface ThresholdConfig {
  tipo: TipoAlerta;
  enabled: boolean;
  thresholdCritico: number | null;
  thresholdMedio: number | null;
  thresholdBaixo: number | null;
  severidadeDefault: Severidade | null;
}

type Config = Record<TipoAlerta, ThresholdConfig>;

const SEVERIDADE_OPTIONS: { value: Severidade; label: string }[] = [
  { value: "BAIXA", label: "Baixo" },
  { value: "MEDIA", label: "Médio" },
  { value: "ALTA", label: "Alto" },
  { value: "CRITICA", label: "Crítico" },
];

export default function AlertasUsinasPersonalizacaoPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/personalizacoes/alertas-usinas")
      .then((r) =>
        r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error ?? "Erro")))
      )
      .then((d: Config) => setConfig(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof ThresholdConfig>(
    tipo: TipoAlerta,
    key: K,
    value: ThresholdConfig[K]
  ) => {
    setConfig((prev) => (prev ? { ...prev, [tipo]: { ...prev[tipo], [key]: value } } : prev));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/personalizacoes/alertas-usinas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Falha ao salvar");
      }
      const updated = (await res.json()) as Config;
      setConfig(updated);
      toast.success("Configurações de alertas salvas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100">
          {error ?? "Configuração não carregada."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-red-600 text-white">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Alertas de usinas</h1>
          <p className="text-sm text-muted-foreground">
            Configure quais erros das usinas serão monitorados e o nível de
            severidade de cada limite.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <BaixaGeracaoCard config={config.BAIXA_GERACAO} update={update} />
        <OfflineCard config={config.OFFLINE} update={update} />
        <TensaoForaCard config={config.TENSAO_FORA} update={update} />
        <TemperaturaCard config={config.TEMPERATURA_INVERSOR} update={update} />
        <FrequenciaCard config={config.FREQUENCIA_REDE} update={update} />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}

type UpdateFn = <K extends keyof ThresholdConfig>(
  tipo: TipoAlerta,
  key: K,
  value: ThresholdConfig[K]
) => void;

function TipoHeader({
  icon: Icon,
  titulo,
  descricao,
  enabled,
  onToggle,
  badge,
}: {
  icon: React.ElementType;
  titulo: string;
  descricao: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  badge?: React.ReactNode;
}) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{titulo}</CardTitle>
              {badge}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{descricao}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4"
          />
          Habilitado
        </label>
      </div>
    </CardHeader>
  );
}

function NumberInput({
  id,
  value,
  onChange,
  suffix = "%",
  disabled,
}: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="number"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className="w-24"
      />
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </div>
  );
}

function BaixaGeracaoCard({
  config,
  update,
}: {
  config: ThresholdConfig;
  update: UpdateFn;
}) {
  return (
    <Card>
      <TipoHeader
        icon={Zap}
        titulo="Geração abaixo do esperado"
        descricao="Compara a geração real da usina contra a expectativa (PR %). Dispara quando fica abaixo dos limites configurados."
        enabled={config.enabled}
        onToggle={(v) => update("BAIXA_GERACAO", "enabled", v)}
      />
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Exemplo com valores padrão (80% / 90%): uma usina gerando 75% do
          esperado dispara alerta <strong>crítico</strong>; 85% dispara{" "}
          <strong>médio</strong>; 95% não dispara.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bg-critico" className="text-red-700 dark:text-red-300">
              Limite crítico — geração ≤
            </Label>
            <NumberInput
              id="bg-critico"
              value={config.thresholdCritico}
              onChange={(v) => update("BAIXA_GERACAO", "thresholdCritico", v)}
              disabled={!config.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bg-medio" className="text-amber-700 dark:text-amber-300">
              Limite médio — geração ≤
            </Label>
            <NumberInput
              id="bg-medio"
              value={config.thresholdMedio}
              onChange={(v) => update("BAIXA_GERACAO", "thresholdMedio", v)}
              disabled={!config.enabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OfflineCard({
  config,
  update,
}: {
  config: ThresholdConfig;
  update: UpdateFn;
}) {
  return (
    <Card>
      <TipoHeader
        icon={WifiOff}
        titulo="Inversor desconectado"
        descricao="Dispara quando o inversor não envia dados há mais de 48 horas."
        enabled={config.enabled}
        onToggle={(v) => update("OFFLINE", "enabled", v)}
      />
      <CardContent>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="off-sev">Severidade do alerta</Label>
          <select
            id="off-sev"
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              !config.enabled && "opacity-50"
            )}
            disabled={!config.enabled}
            value={config.severidadeDefault ?? "CRITICA"}
            onChange={(e) =>
              update("OFFLINE", "severidadeDefault", e.target.value as Severidade)
            }
          >
            {SEVERIDADE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}

function TensaoForaCard({
  config,
  update,
}: {
  config: ThresholdConfig;
  update: UpdateFn;
}) {
  return (
    <Card>
      <TipoHeader
        icon={AlertTriangle}
        titulo="Tensão da concessionária fora dos parâmetros"
        descricao="Dispara conforme o desvio percentual da tensão da rede em relação à nominal (127V ou 220V, inferida pela medida)."
        enabled={config.enabled}
        onToggle={(v) => update("TENSAO_FORA", "enabled", v)}
      />
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Exemplo com valores padrão (5% / 10% / 20%): em uma rede 220V, uma
          leitura de 235V representa desvio de ~6,8% — dispara{" "}
          <strong>baixo</strong>; 245V (~11,4%) dispara <strong>médio</strong>;
          270V (~22,7%) dispara <strong>crítico</strong>.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="tf-baixo" className="text-sky-700 dark:text-sky-300">
              Limite baixo — desvio ≥
            </Label>
            <NumberInput
              id="tf-baixo"
              value={config.thresholdBaixo}
              onChange={(v) => update("TENSAO_FORA", "thresholdBaixo", v)}
              disabled={!config.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tf-medio" className="text-amber-700 dark:text-amber-300">
              Limite médio — desvio ≥
            </Label>
            <NumberInput
              id="tf-medio"
              value={config.thresholdMedio}
              onChange={(v) => update("TENSAO_FORA", "thresholdMedio", v)}
              disabled={!config.enabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tf-critico" className="text-red-700 dark:text-red-300">
              Limite crítico — desvio ≥
            </Label>
            <NumberInput
              id="tf-critico"
              value={config.thresholdCritico}
              onChange={(v) => update("TENSAO_FORA", "thresholdCritico", v)}
              disabled={!config.enabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TemperaturaCard({
  config,
  update,
}: {
  config: ThresholdConfig;
  update: UpdateFn;
}) {
  return (
    <Card>
      <TipoHeader
        icon={Thermometer}
        titulo="Temperatura do inversor elevada"
        descricao="Dispara quando a temperatura interna do inversor ultrapassa os limites (em °C). Inversores derratam acima de 65°C e podem desligar acima de 75–80°C."
        enabled={config.enabled}
        onToggle={(v) => update("TEMPERATURA_INVERSOR", "enabled", v)}
      />
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Exemplo com valores padrão (65°C / 75°C): 60°C não dispara; 70°C
          dispara <strong>médio</strong>; 80°C dispara <strong>crítico</strong>.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ti-medio" className="text-amber-700 dark:text-amber-300">
              Limite médio — temperatura ≥
            </Label>
            <NumberInput
              id="ti-medio"
              value={config.thresholdMedio}
              onChange={(v) => update("TEMPERATURA_INVERSOR", "thresholdMedio", v)}
              disabled={!config.enabled}
              suffix="°C"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ti-critico" className="text-red-700 dark:text-red-300">
              Limite crítico — temperatura ≥
            </Label>
            <NumberInput
              id="ti-critico"
              value={config.thresholdCritico}
              onChange={(v) => update("TEMPERATURA_INVERSOR", "thresholdCritico", v)}
              disabled={!config.enabled}
              suffix="°C"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FrequenciaCard({
  config,
  update,
}: {
  config: ThresholdConfig;
  update: UpdateFn;
}) {
  return (
    <Card>
      <TipoHeader
        icon={Activity}
        titulo="Frequência da rede fora do nominal"
        descricao="Dispara conforme o desvio absoluto da frequência em relação a 60 Hz (nominal no Brasil). Limites operacionais de anti-ilhamento: 57,5–62 Hz."
        enabled={config.enabled}
        onToggle={(v) => update("FREQUENCIA_REDE", "enabled", v)}
      />
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          Exemplo com valores padrão (0,5 / 1,0 / 2,0 Hz): 60,3 Hz não dispara;
          60,7 Hz dispara <strong>baixo</strong>; 58,5 Hz dispara{" "}
          <strong>médio</strong>; 57,5 Hz dispara <strong>crítico</strong>.
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="fr-baixo" className="text-sky-700 dark:text-sky-300">
              Limite baixo — desvio ≥
            </Label>
            <NumberInput
              id="fr-baixo"
              value={config.thresholdBaixo}
              onChange={(v) => update("FREQUENCIA_REDE", "thresholdBaixo", v)}
              disabled={!config.enabled}
              suffix="Hz"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fr-medio" className="text-amber-700 dark:text-amber-300">
              Limite médio — desvio ≥
            </Label>
            <NumberInput
              id="fr-medio"
              value={config.thresholdMedio}
              onChange={(v) => update("FREQUENCIA_REDE", "thresholdMedio", v)}
              disabled={!config.enabled}
              suffix="Hz"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fr-critico" className="text-red-700 dark:text-red-300">
              Limite crítico — desvio ≥
            </Label>
            <NumberInput
              id="fr-critico"
              value={config.thresholdCritico}
              onChange={(v) => update("FREQUENCIA_REDE", "thresholdCritico", v)}
              disabled={!config.enabled}
              suffix="Hz"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
