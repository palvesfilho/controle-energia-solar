"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  Zap,
  Users,
  MapPin,
  DollarSign,
  BarChart3,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { formatKWh } from "@/lib/formatters";
import { CONCESSIONARIAS } from "@/lib/concessionarias";
import { PlantCredentialsForm } from "@/components/plants/plant-credentials-form";
import { PlantDocumentsCard } from "@/components/plants/plant-documents-card";
import { MonitoringClientsPanel } from "@/components/plants/monitoring-clients-panel";

const PlantMonitoringCharts = dynamic(
  () =>
    import("@/components/dashboard/plant-monitoring-charts").then(
      (m) => m.PlantMonitoringCharts
    ),
  {
    ssr: false,
    loading: () => (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Carregando gráficos...
      </div>
    ),
  }
);

const INVERSOR_MARCAS: Record<string, string[]> = {
  Growatt: [
    "MIC 600TL-X", "MIC 750TL-X", "MIC 1000TL-X", "MIC 1500TL-X", "MIC 2000TL-X", "MIC 2500TL-X", "MIC 3000TL-X",
    "MIN 2500TL-X", "MIN 3000TL-X", "MIN 3600TL-X", "MIN 4200TL-X", "MIN 4600TL-X", "MIN 5000TL-X", "MIN 6000TL-X",
    "MOD 3000TL3-X", "MOD 4000TL3-X", "MOD 5000TL3-X", "MOD 6000TL3-X", "MOD 7000TL3-X", "MOD 8000TL3-X", "MOD 10KTL3-X",
    "MAC 25KTL3-X", "MAC 30KTL3-X", "MAC 36KTL3-X", "MAC 40KTL3-X", "MAC 50KTL3-X", "MAC 60KTL3-XH",
    "MAX 50KTL3 LV", "MAX 60KTL3 LV", "MAX 70KTL3 LV", "MAX 75KTL3 LV", "MAX 80KTL3 LV", "MAX 100KTL3 LV",
  ],
  Huawei: [
    "SUN2000-2KTL-L1", "SUN2000-3KTL-L1", "SUN2000-3.68KTL-L1", "SUN2000-4KTL-L1", "SUN2000-4.6KTL-L1", "SUN2000-5KTL-L1", "SUN2000-6KTL-L1",
    "SUN2000-8KTL-M1", "SUN2000-10KTL-M1", "SUN2000-12KTL-M2", "SUN2000-15KTL-M2", "SUN2000-17KTL-M2", "SUN2000-20KTL-M2",
    "SUN2000-25KTL-M5", "SUN2000-30KTL-M3", "SUN2000-33KTL-A", "SUN2000-36KTL-A", "SUN2000-40KTL-M3",
    "SUN2000-50KTL-M3", "SUN2000-60KTL-M0", "SUN2000-100KTL-M1",
  ],
  "Canadian Solar": [
    "CSI-3K-S", "CSI-4K-S", "CSI-5K-S", "CSI-6K-S",
    "CSI-5K-T", "CSI-6K-T", "CSI-8K-T", "CSI-10K-T", "CSI-12K-T", "CSI-15K-T", "CSI-20K-T",
    "CSI-25K-T", "CSI-30K-T", "CSI-36K-T", "CSI-40K-T", "CSI-50K-T",
  ],
  Sungrow: [
    "SG2K-S", "SG3K-S", "SG4K-D", "SG5K-D", "SG6K-D", "SG7K-D", "SG8K-D", "SG10K-D",
    "SG12KTL-M", "SG15KTL-M", "SG20KTL-M", "SG25KTL-M",
    "SG30KTL-M", "SG33KTL-M", "SG36KTL-M", "SG40KTL-M", "SG50KTL-M-20",
    "SG60KTL-M", "SG75KTL", "SG100KTL", "SG110KTL-M", "SG125KTL-M",
  ],
  Fronius: [
    "Primo 3.0-1", "Primo 3.5-1", "Primo 3.6-1", "Primo 4.0-1", "Primo 4.6-1", "Primo 5.0-1", "Primo 6.0-1", "Primo 8.2-1",
    "Symo 10.0-3-M", "Symo 12.5-3-M", "Symo 15.0-3-M", "Symo 17.5-3-M", "Symo 20.0-3-M",
    "Tauro ECO 50-3-D", "Tauro ECO 100-3-D",
  ],
  Deye: [
    "SUN-3K-G", "SUN-4K-G", "SUN-5K-G", "SUN-6K-G", "SUN-7K-G", "SUN-8K-G", "SUN-10K-G", "SUN-12K-G",
    "SUN-15K-G", "SUN-20K-G", "SUN-25K-G", "SUN-30K-G", "SUN-33K-G", "SUN-36K-G", "SUN-40K-G", "SUN-50K-G",
  ],
  "ABB/FIMER": [
    "UNO-DM-1.2-TL-PLUS", "UNO-DM-2.0-TL-PLUS", "UNO-DM-3.0-TL-PLUS", "UNO-DM-3.3-TL-PLUS", "UNO-DM-4.0-TL-PLUS", "UNO-DM-5.0-TL-PLUS", "UNO-DM-6.0-TL-PLUS",
    "PVS-10-TL", "PVS-12.5-TL", "PVS-20-TL", "PVS-33-TL",
    "PVS-50-TL", "PVS-100-TL",
  ],
  GoodWe: [
    "GW2000-NS", "GW2500-NS", "GW3000-NS", "GW3600-NS",
    "GW5000-DT", "GW6000-DT", "GW8000-DT", "GW10000-DT",
    "GW25K-MT", "GW30K-MT", "GW36K-MT", "GW40K-MT", "GW50K-MT",
  ],
  SolaX: [
    "X1-Mini 0.7", "X1-Mini 1.1", "X1-Mini 1.5", "X1-Mini 2.0", "X1-Mini 2.5", "X1-Mini 3.0",
    "X1-Boost 3.0", "X1-Boost 3.3", "X1-Boost 3.6", "X1-Boost 4.2", "X1-Boost 5.0",
    "X3-MIC 4.0T", "X3-MIC 5.0T", "X3-MIC 6.0T", "X3-MIC 8.0T", "X3-MIC 10.0T", "X3-MIC 15.0T",
    "X3-Mega G2 30K", "X3-Mega G2 40K", "X3-Mega G2 50K",
  ],
  BYD: [
    "BHM 3.0", "BHM 4.0", "BHM 5.0", "BHM 6.0",
    "BHT 8.0", "BHT 10.0", "BHT 12.0", "BHT 15.0", "BHT 20.0",
  ],
  Outro: [],
};

const REGRAS_INSTALACAO: Array<{ value: string; label: string; hint: string }> = [
  { value: "USINA_DEDICADA", label: "Usina dedicada", hint: "Só gera; toda a geração do inversor é injetada na rede." },
  { value: "USINA_CONSUMO_PROPRIO", label: "Usina com consumo próprio junto à carga", hint: "Parte da geração é consumida localmente antes de ir para a rede." },
  { value: "USINA_CONSUMO_DESCONTADO", label: "Usina com consumo descontado junto à carga", hint: "Consumo local é descontado/compensado na mesma fatura." },
];

const PLATAFORMAS_MONITORAMENTO = [
  "Growatt - ShineServer",
  "Huawei - FusionSolar",
  "Canadian Solar - CSI Cloud",
  "Sungrow - iSolarCloud",
  "Fronius - Solar.web",
  "Deye - SolarMan",
  "ABB/FIMER - Aurora Vision",
  "GoodWe - SEMS Portal",
  "SolaX - SolaX Cloud",
  "BYD - Be Connect",
  "Outro",
];

interface ConsumerPlantData {
  id: string;
  cotaPercent: number | null;
  descontoPercent: number | null;
  consumer: {
    id: string;
    name: string;
    unidadeConsumidora: string | null;
    active: boolean;
  };
}

interface InvestorLink {
  id: string;
  sharePercent: number | null;
  valorKwhContrato: number | null;
  gestaoFixaContrato: number | null;
  investor: { id: string; user: { id: string; name: string } };
}

interface InvestorOption {
  id: string;
  user: { id: string; name: string; email: string };
}

interface PlantData {
  id: string;
  name: string;
  location: string | null;
  potenciaModulos: number | null;
  potenciaInversor: number | null;
  geracaoMediaMensal: number | null;
  enquadramento: string | null;
  unidadeConsumidora: string | null;
  concessionaria: string | null;
  formatoLeitura: string | null;
  regraInstalacao: string | null;
  dataAssinaturaContrato: string | null;
  diaPagamentoInvestidor: number;
  active: boolean;
  inversorMarca: string | null;
  inversorModelo: string | null;
  monitoramentoPlataforma: string | null;
  monitoramentoLogin: string | null;
  monitoramentoSenha: string | null;
  monitoramentoUrl: string | null;
  investors: InvestorLink[];
  consumers: ConsumerPlantData[];
}

const ACCENT_CLASSES = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="bg-card rounded-lg border group">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90 shrink-0" />
          <span className="font-semibold truncate">{title}</span>
          {hint && (
            <span className="text-xs text-muted-foreground hidden sm:inline truncate">
              — {hint}
            </span>
          )}
        </div>
        {action && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className="shrink-0"
          >
            {action}
          </div>
        )}
      </summary>
      <div className="p-4 border-t">{children}</div>
    </details>
  );
}

function Field({
  label,
  name,
  type = "text",
  step,
  defaultValue,
  required,
  className,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        step={step}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
    </div>
  );
}

export default function UsinaPage() {
  const params = useParams();
  const plantId = params.id as string;

  const [plant, setPlant] = useState<PlantData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedRegra, setSelectedRegra] = useState("");
  const [selectedFormatoLeitura, setSelectedFormatoLeitura] = useState("");
  const [selectedEnquadramento, setSelectedEnquadramento] = useState("");
  const [selectedConcessionaria, setSelectedConcessionaria] = useState("");
  const [dadosSaving, setDadosSaving] = useState(false);

  const [selectedMarca, setSelectedMarca] = useState("");
  const [selectedModelo, setSelectedModelo] = useState("");
  const [selectedPlataforma, setSelectedPlataforma] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [monitoramentoSaving, setMonitoramentoSaving] = useState(false);

  const [linkerOpen, setLinkerOpen] = useState(false);
  const [availableInvestors, setAvailableInvestors] = useState<InvestorOption[]>([]);
  const [linkInvestorId, setLinkInvestorId] = useState("");
  const [linkSharePercent, setLinkSharePercent] = useState("");
  const [linkValorKwh, setLinkValorKwh] = useState("");
  const [linkGestaoFixa, setLinkGestaoFixa] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [investoresSaving, setInvestoresSaving] = useState(false);

  const loadPlant = useCallback(async () => {
    const plantData = await fetch(`/api/plants/${plantId}`).then((r) => r.json());
    setPlant(plantData);
    setSelectedRegra(plantData?.regraInstalacao ?? "");
    setSelectedFormatoLeitura(plantData?.formatoLeitura ?? "");
    setSelectedEnquadramento(plantData?.enquadramento ?? "");
    setSelectedConcessionaria(plantData?.concessionaria ?? "");
    setSelectedMarca(plantData?.inversorMarca ?? "");
    setSelectedModelo(plantData?.inversorModelo ?? "");
    setSelectedPlataforma(plantData?.monitoramentoPlataforma ?? "");
    setLoading(false);
  }, [plantId]);

  useEffect(() => {
    loadPlant();
  }, [loadPlant]);

  async function handleSaveDados(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDadosSaving(true);
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(fd.entries());
    data.regraInstalacao = selectedRegra;
    data.formatoLeitura = selectedFormatoLeitura;
    data.enquadramento = selectedEnquadramento;
    data.concessionaria = selectedConcessionaria;

    const res = await fetch(`/api/plants/${plantId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error("Erro ao salvar", { description: err.error });
      setDadosSaving(false);
      return;
    }

    toast.success("Dados da usina salvos");
    await loadPlant();
    setDadosSaving(false);
  }

  async function handleSaveMonitoramento(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMonitoramentoSaving(true);
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(fd.entries());
    data.inversorMarca = selectedMarca;
    data.inversorModelo = selectedModelo;
    data.monitoramentoPlataforma = selectedPlataforma;

    const res = await fetch(`/api/plants/${plantId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error("Erro ao salvar", { description: err.error });
      setMonitoramentoSaving(false);
      return;
    }

    toast.success("Acesso ao monitoramento salvo");
    await loadPlant();
    setMonitoramentoSaving(false);
  }

  async function handleSaveInvestores(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plant) return;
    setInvestoresSaving(true);
    const fd = new FormData(e.currentTarget);

    const results = await Promise.all(
      plant.investors.map((link) =>
        fetch(`/api/plants/${plantId}/investors/${link.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valorKwhContrato: fd.get(`valorKwhContrato_${link.id}`) || null,
            gestaoFixaContrato: fd.get(`gestaoFixaContrato_${link.id}`) || null,
            sharePercent: fd.get(`sharePercent_${link.id}`) || null,
          }),
        }).then((r) => r.ok)
      )
    );

    const allOk = results.every(Boolean);
    if (!allOk) {
      toast.error("Alguns vínculos não foram atualizados");
    } else {
      toast.success("Investidores atualizados");
    }
    await loadPlant();
    setInvestoresSaving(false);
  }

  async function openLinker() {
    setLinkerOpen(true);
    setLinkInvestorId("");
    setLinkSharePercent("");
    setLinkValorKwh("");
    setLinkGestaoFixa("");
    try {
      const res = await fetch("/api/investors");
      const data: InvestorOption[] = await res.json();
      const linkedIds = new Set((plant?.investors ?? []).map((l) => l.investor.id));
      setAvailableInvestors(data.filter((i) => !linkedIds.has(i.id)));
    } catch {
      setAvailableInvestors([]);
    }
  }

  async function handleLinkInvestor() {
    if (!linkInvestorId) {
      toast.error("Selecione um investidor");
      return;
    }
    setLinkSaving(true);
    try {
      const res = await fetch(`/api/plants/${plantId}/investors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: linkInvestorId,
          sharePercent: linkSharePercent || null,
          valorKwhContrato: linkValorKwh || null,
          gestaoFixaContrato: linkGestaoFixa || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao vincular");
        return;
      }
      setLinkerOpen(false);
      toast.success("Investidor vinculado");
      await loadPlant();
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleRemoveInvestorLink(linkId: string) {
    if (!confirm("Tem certeza que deseja desvincular este investidor?")) return;
    const res = await fetch(`/api/plants/${plantId}/investors/${linkId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Erro ao remover vínculo");
      return;
    }
    toast.success("Investidor desvinculado");
    await loadPlant();
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!plant) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Usina não encontrada.</div>;
  }

  const totalConsumers = plant.consumers?.length ?? 0;
  const totalInvestors = plant.investors?.length ?? 0;
  const marcaHasModelos =
    selectedMarca && selectedMarca !== "Outro" && INVERSOR_MARCAS[selectedMarca]?.length > 0;

  return (
    <div className="space-y-4 max-w-6xl">
      <Link
        href="/admin/usinas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para usinas
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{plant.name}</h1>
          <Badge
            variant={plant.active ? "default" : "secondary"}
            className={plant.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
          >
            {plant.active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        {plant.location && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {plant.location}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Potência"
          value={`${plant.potenciaModulos ?? "-"} kWp`}
          accent="amber"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Geração média"
          value={plant.geracaoMediaMensal ? formatKWh(plant.geracaoMediaMensal) : "-"}
          accent="teal"
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Investidores"
          value={totalInvestors}
          accent="blue"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Consumidores"
          value={totalConsumers}
          accent="emerald"
        />
      </div>

      {/* 1 — Visão geral */}
      <Section
        title="Visão geral"
        hint="dados técnicos · histórico · gráficos · consumidores"
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Dados técnicos</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {[
                ["Potência Módulos", `${plant.potenciaModulos ?? "-"} kWp`],
                ["Potência Inversor", `${plant.potenciaInversor ?? "-"} kW`],
                ["Geração Média Mensal", plant.geracaoMediaMensal ? formatKWh(plant.geracaoMediaMensal) : "-"],
                ["Enquadramento", plant.enquadramento ?? "-"],
                ["Unidade Consumidora", plant.unidadeConsumidora ?? "-"],
                ["Concessionária", plant.concessionaria ?? "-"],
                ["Formato Leitura", plant.formatoLeitura ?? "-"],
                ["Marca Inversor", plant.inversorMarca ?? "-"],
                ["Modelo Inversor", plant.inversorModelo ?? "-"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Gráficos de monitoramento</div>
            <PlantMonitoringCharts
              plantId={plant.id}
              plantName={plant.name}
              potencia={plant.potenciaModulos}
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Consumidores ({totalConsumers})</div>
            {totalConsumers === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg">
                Nenhum consumidor vinculado.
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Consumidor</th>
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">UC</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Cota (%)</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Desconto (%)</th>
                      <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plant.consumers.map((cp) => (
                      <tr key={cp.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{cp.consumer.name}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{cp.consumer.unidadeConsumidora ?? "-"}</td>
                        <td className="py-2.5 px-3 text-right">{cp.cotaPercent ?? "-"}%</td>
                        <td className="py-2.5 px-3 text-right">{cp.descontoPercent ?? "-"}%</td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge
                            variant={cp.consumer.active ? "default" : "secondary"}
                            className={cp.consumer.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                          >
                            {cp.consumer.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* 2 — Dados da usina */}
      <Section title="Dados da usina" hint="editar informações cadastrais">
        <form key={`dados-${plant.id}`} onSubmit={handleSaveDados} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome da usina" name="name" defaultValue={plant.name} required />
            <Field label="Localização" name="location" defaultValue={plant.location} />
            <Field label="Potência Módulos (kWp)" name="potenciaModulos" type="number" step="0.01" defaultValue={plant.potenciaModulos} />
            <Field label="Potência Inversor (kW)" name="potenciaInversor" type="number" step="0.01" defaultValue={plant.potenciaInversor} />
            <Field label="Geração Média Mensal (kWh)" name="geracaoMediaMensal" type="number" step="0.01" defaultValue={plant.geracaoMediaMensal} />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Enquadramento</label>
              <select
                value={selectedEnquadramento}
                onChange={(e) => setSelectedEnquadramento(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione</option>
                <option value="GD1">GD1</option>
                <option value="GD2">GD2</option>
              </select>
            </div>
            <Field label="Unidade Consumidora" name="unidadeConsumidora" defaultValue={plant.unidadeConsumidora} />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Concessionária</label>
              <select
                value={selectedConcessionaria}
                onChange={(e) => setSelectedConcessionaria(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione</option>
                {CONCESSIONARIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Formato de Leitura</label>
              <select
                value={selectedFormatoLeitura}
                onChange={(e) => setSelectedFormatoLeitura(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione</option>
                <option value="MENSAL">Mensal</option>
                <option value="PLURIMENSAL">Plurimensal</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Regra de instalação</label>
              <select
                value={selectedRegra}
                onChange={(e) => setSelectedRegra(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione a regra</option>
                {REGRAS_INSTALACAO.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {selectedRegra && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {REGRAS_INSTALACAO.find((r) => r.value === selectedRegra)?.hint}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Data de assinatura do contrato com o investidor"
                name="dataAssinaturaContrato"
                type="date"
                defaultValue={plant.dataAssinaturaContrato?.slice(0, 10) ?? ""}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Define o início da janela de faturas a descontar no primeiro relatório do investidor.
              </p>
            </div>
            <div>
              <Field
                label="Dia de pagamento do investidor"
                name="diaPagamentoInvestidor"
                type="number"
                defaultValue={String(plant.diaPagamentoInvestidor ?? 20)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Dia do mês (1 a 28) em que esta usina paga o investidor. Usado na Agenda da Semana
                — o relatório aparece 3 dias antes.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={dadosSaving}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {dadosSaving ? "Salvando..." : "Salvar dados da usina"}
            </button>
          </div>
        </form>
      </Section>

      {/* 3 — Investidores vinculados */}
      <Section
        title="Investidores vinculados"
        hint={`${totalInvestors} vinculado${totalInvestors === 1 ? "" : "s"}`}
        action={
          <button
            type="button"
            onClick={openLinker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Vincular investidor
          </button>
        }
      >
        {totalInvestors === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum investidor vinculado a esta usina. Clique em <b>Vincular investidor</b> para adicionar.
          </div>
        ) : (
          <form key={`inv-${plant.id}`} onSubmit={handleSaveInvestores} className="space-y-3">
            {plant.investors.map((link) => (
              <div key={link.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{link.investor.user.name}</div>
                  <button
                    type="button"
                    onClick={() => handleRemoveInvestorLink(link.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desvincular
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="Valor kWh Contrato (R$)"
                    name={`valorKwhContrato_${link.id}`}
                    type="number"
                    step="0.01"
                    defaultValue={link.valorKwhContrato}
                  />
                  <Field
                    label="Gestão Fixa Mensal (R$)"
                    name={`gestaoFixaContrato_${link.id}`}
                    type="number"
                    step="0.01"
                    defaultValue={link.gestaoFixaContrato}
                  />
                  <Field
                    label="Participação (%)"
                    name={`sharePercent_${link.id}`}
                    type="number"
                    step="0.01"
                    defaultValue={link.sharePercent}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={investoresSaving}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {investoresSaving ? "Salvando..." : "Salvar investidores"}
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* 4 — Acesso ao monitoramento */}
      <Section title="Acesso ao monitoramento" hint="inversor e portal da fabricante">
        <form key={`mon-${plant.id}`} onSubmit={handleSaveMonitoramento} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Marca do Inversor</label>
              <select
                value={selectedMarca}
                onChange={(e) => {
                  setSelectedMarca(e.target.value);
                  setSelectedModelo("");
                }}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione a marca</option>
                {Object.keys(INVERSOR_MARCAS).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Modelo do Inversor</label>
              {marcaHasModelos ? (
                <select
                  value={selectedModelo}
                  onChange={(e) => setSelectedModelo(e.target.value)}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  <option value="">Selecione o modelo</option>
                  {INVERSOR_MARCAS[selectedMarca].map((modelo) => (
                    <option key={modelo} value={modelo}>{modelo}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedModelo}
                  onChange={(e) => setSelectedModelo(e.target.value)}
                  placeholder={selectedMarca === "Outro" ? "Digite o modelo" : "Selecione a marca primeiro"}
                  disabled={!selectedMarca}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Plataforma</label>
              <select
                value={selectedPlataforma}
                onChange={(e) => setSelectedPlataforma(e.target.value)}
                className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">Selecione a plataforma</option>
                {PLATAFORMAS_MONITORAMENTO.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <Field
              label="URL do Portal"
              name="monitoramentoUrl"
              defaultValue={plant.monitoramentoUrl}
              placeholder="https://..."
              className="sm:col-span-2"
            />
            <Field
              label="Login / Email"
              name="monitoramentoLogin"
              defaultValue={plant.monitoramentoLogin}
              placeholder="usuario@email.com"
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground">Senha</label>
              <div className="relative mt-1">
                <input
                  name="monitoramentoSenha"
                  type={showSenha ? "text" : "password"}
                  defaultValue={plant.monitoramentoSenha ?? ""}
                  placeholder="••••••••"
                  className="w-full text-sm border rounded-md px-3 py-1.5 pr-9 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSenha(!showSenha)}
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={monitoramentoSaving}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {monitoramentoSaving ? "Salvando..." : "Salvar monitoramento"}
            </button>
          </div>
        </form>
      </Section>

      {/* 5 — Usinas monitoradas */}
      <Section title="Usinas monitoradas" hint="clientes Brasil Solar vinculados a esta usina">
        <MonitoringClientsPanel plantId={plant.id} embedded />
      </Section>

      {/* 6 — Documentos */}
      <Section title="Documentos" hint="CNH/RG · Procuração · Contrato Social · Cartão CNPJ">
        <PlantDocumentsCard plantId={plant.id} embedded />
      </Section>

      {/* 7 — Acesso à distribuidora */}
      <Section title="Acesso à distribuidora" hint="credenciais para consulta Infosimples">
        <PlantCredentialsForm
          plantId={plant.id}
          defaultInstalacao={plant.unidadeConsumidora ?? ""}
          embedded
        />
      </Section>

      {linkerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => !linkSaving && setLinkerOpen(false)}
        >
          <div
            className="bg-background rounded-lg shadow-lg border w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-base">Vincular investidor</h3>
              <button
                type="button"
                onClick={() => !linkSaving && setLinkerOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Investidor</label>
                <select
                  value={linkInvestorId}
                  onChange={(e) => setLinkInvestorId(e.target.value)}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                >
                  <option value="">— selecione —</option>
                  {availableInvestors.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.user.name} · {inv.user.email}
                    </option>
                  ))}
                </select>
                {availableInvestors.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Todos os investidores já estão vinculados ou nenhum foi cadastrado.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Participação (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={linkSharePercent}
                    onChange={(e) => setLinkSharePercent(e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Valor kWh (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={linkValorKwh}
                    onChange={(e) => setLinkValorKwh(e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Gestão fixa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={linkGestaoFixa}
                    onChange={(e) => setLinkGestaoFixa(e.target.value)}
                    className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/30">
              <button
                type="button"
                onClick={() => setLinkerOpen(false)}
                disabled={linkSaving}
                className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLinkInvestor}
                disabled={linkSaving || !linkInvestorId}
                className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {linkSaving ? "Vinculando..." : "Vincular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
