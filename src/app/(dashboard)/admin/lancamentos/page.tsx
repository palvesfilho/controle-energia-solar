"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatKWh, formatBRL, formatMonthYear } from "@/lib/formatters";
import { Zap, Users, Pencil, Save } from "lucide-react";

interface PlantOption {
  id: string;
  name: string;
}

interface ConsumerOption {
  id: string;
  name: string;
  unidadeConsumidora: string | null;
  plants: { plantId: string; plant: { id: string; name: string } }[];
}

interface PlantMonthlyData {
  id: string;
  ano: number;
  mes: number;
  geracaoTotal: number | null;
  injecaoTotal: number | null;
  autoConsumo: number | null;
  disponibilidade: number | null;
  observacoes: string | null;
  plant: { id?: string; name: string };
}

interface ConsumerMonthlyData {
  id: string;
  ano: number;
  mes: number;
  consumoTotal: number | null;
  creditosRecebidos: number | null;
  creditosUtilizados: number | null;
  saldoCreditos: number | null;
  economiaGerada: number | null;
  observacoes: string | null;
  consumer: { name: string; unidadeConsumidora: string | null };
  plant: { name: string };
}

const currentYear = new Date().getFullYear();
const months = Array.from({ length: 12 }, (_, i) => i + 1);
const years = [currentYear - 1, currentYear, currentYear + 1];

const selectClass =
  "w-full text-sm border rounded-lg px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all";
const inputClass = selectClass;

export default function LancamentosPage() {
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [consumers, setConsumers] = useState<ConsumerOption[]>([]);
  const [plantHistory, setPlantHistory] = useState<PlantMonthlyData[]>([]);
  const [consumerHistory, setConsumerHistory] = useState<ConsumerMonthlyData[]>([]);

  const [selectedPlant, setSelectedPlant] = useState("");
  const [plantAno, setPlantAno] = useState(String(currentYear));
  const [plantMes, setPlantMes] = useState(String(new Date().getMonth() + 1));
  const [plantSaving, setPlantSaving] = useState(false);

  const [selectedConsumer, setSelectedConsumer] = useState("");
  const [selectedConsumerPlant, setSelectedConsumerPlant] = useState("");
  const [consumerAno, setConsumerAno] = useState(String(currentYear));
  const [consumerMes, setConsumerMes] = useState(String(new Date().getMonth() + 1));
  const [consumerSaving, setConsumerSaving] = useState(false);

  useEffect(() => {
    fetch("/api/plants").then((r) => r.json()).then(setPlants);
    fetch("/api/consumers").then((r) => r.json()).then(setConsumers);
    loadPlantHistory();
    loadConsumerHistory();
  }, []);

  function loadPlantHistory() {
    fetch("/api/plant-monthly").then((r) => r.json()).then(setPlantHistory);
  }

  function loadConsumerHistory() {
    fetch("/api/consumer-monthly").then((r) => r.json()).then(setConsumerHistory);
  }

  async function handlePlantSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPlant) {
      toast.error("Selecione uma usina");
      return;
    }
    setPlantSaving(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      plantId: selectedPlant,
      ano: plantAno,
      mes: plantMes,
      ...Object.fromEntries(formData.entries()),
    };

    const res = await fetch("/api/plant-monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Geração lançada", { description: `${formatMonthYear(Number(plantMes), Number(plantAno))}` });
      loadPlantHistory();
      (e.target as HTMLFormElement).reset();
    } else {
      toast.error("Erro ao lançar dados");
    }
    setPlantSaving(false);
  }

  async function handleConsumerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedConsumer || !selectedConsumerPlant) {
      toast.error("Selecione consumidor e usina");
      return;
    }
    setConsumerSaving(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      consumerId: selectedConsumer,
      plantId: selectedConsumerPlant,
      ano: consumerAno,
      mes: consumerMes,
      ...Object.fromEntries(formData.entries()),
    };

    const res = await fetch("/api/consumer-monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Consumo lançado", { description: `${formatMonthYear(Number(consumerMes), Number(consumerAno))}` });
      loadConsumerHistory();
      (e.target as HTMLFormElement).reset();
    } else {
      toast.error("Erro ao lançar dados");
    }
    setConsumerSaving(false);
  }

  const selectedConsumerObj = consumers.find((c) => c.id === selectedConsumer);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lançamentos</h1>
        <p className="text-sm text-muted-foreground">
          Lance e edite dados mensais de geração e consumo
        </p>
      </div>

      <Tabs defaultValue="usinas">
        <TabsList>
          <TabsTrigger value="usinas" className="gap-2">
            <Zap className="h-4 w-4" />
            Geração de Usinas
          </TabsTrigger>
          <TabsTrigger value="consumidores" className="gap-2">
            <Users className="h-4 w-4" />
            Consumo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usinas" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Novo Lançamento — Geração da Usina</h2>
                <p className="text-xs text-muted-foreground">Informe os valores mensais de geração</p>
              </div>
              <form onSubmit={handlePlantSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField label="Usina">
                    <select
                      value={selectedPlant}
                      onChange={(e) => setSelectedPlant(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Selecione</option>
                      {plants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Mês">
                    <select
                      value={plantMes}
                      onChange={(e) => setPlantMes(e.target.value)}
                      className={selectClass}
                    >
                      {months.map((m) => (
                        <option key={m} value={String(m)}>
                          {formatMonthYear(m, Number(plantAno)).split(" ")[0]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Ano">
                    <select
                      value={plantAno}
                      onChange={(e) => setPlantAno(e.target.value)}
                      className={selectClass}
                    >
                      {years.map((y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <FormField label="Geração Total (kWh)">
                    <input name="geracaoTotal" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Injeção na Rede (kWh)">
                    <input name="injecaoTotal" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Autoconsumo (kWh)">
                    <input name="autoConsumo" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Disponibilidade (%)">
                    <input name="disponibilidade" type="number" step="0.01" className={inputClass} />
                  </FormField>
                </div>
                <FormField label="Observações">
                  <textarea name="observacoes" rows={2} className={inputClass} />
                </FormField>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={plantSaving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {plantSaving ? "Salvando..." : "Lançar Geração"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Histórico de Geração</h2>
                <span className="text-xs text-muted-foreground">
                  {plantHistory.length} lançamento{plantHistory.length !== 1 ? "s" : ""}
                </span>
              </div>
              {plantHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento registrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Período</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Geração</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Injeção</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Autoconsumo</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Disp.</th>
                        <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantHistory.map((row) => (
                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 font-medium">{row.plant.name}</td>
                          <td className="py-2.5 px-3">{formatMonthYear(row.mes, row.ano)}</td>
                          <td className="py-2.5 px-3 text-right">{row.geracaoTotal ? formatKWh(row.geracaoTotal) : "-"}</td>
                          <td className="py-2.5 px-3 text-right">{row.injecaoTotal ? formatKWh(row.injecaoTotal) : "-"}</td>
                          <td className="py-2.5 px-3 text-right">{row.autoConsumo ? formatKWh(row.autoConsumo) : "-"}</td>
                          <td className="py-2.5 px-3 text-right">{row.disponibilidade ? `${row.disponibilidade}%` : "-"}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => {
                                setSelectedPlant(plants.find((p) => p.name === row.plant.name)?.id ?? "");
                                setPlantAno(String(row.ano));
                                setPlantMes(String(row.mes));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="inline-flex p-1.5 rounded hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumidores" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Novo Lançamento — Consumo</h2>
                <p className="text-xs text-muted-foreground">Informe os dados mensais do consumidor</p>
              </div>
              <form onSubmit={handleConsumerSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <FormField label="Consumidor">
                    <select
                      value={selectedConsumer}
                      onChange={(e) => {
                        setSelectedConsumer(e.target.value);
                        setSelectedConsumerPlant("");
                      }}
                      className={selectClass}
                    >
                      <option value="">Selecione</option>
                      {consumers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Usina">
                    <select
                      value={selectedConsumerPlant}
                      onChange={(e) => setSelectedConsumerPlant(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Selecione</option>
                      {(selectedConsumerObj?.plants ?? []).map((cp) => (
                        <option key={cp.plantId} value={cp.plantId}>
                          {cp.plant.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Mês">
                    <select
                      value={consumerMes}
                      onChange={(e) => setConsumerMes(e.target.value)}
                      className={selectClass}
                    >
                      {months.map((m) => (
                        <option key={m} value={String(m)}>
                          {formatMonthYear(m, Number(consumerAno)).split(" ")[0]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Ano">
                    <select
                      value={consumerAno}
                      onChange={(e) => setConsumerAno(e.target.value)}
                      className={selectClass}
                    >
                      {years.map((y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <FormField label="Consumo Total (kWh)">
                    <input name="consumoTotal" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Créditos Recebidos (kWh)">
                    <input name="creditosRecebidos" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Créditos Utilizados (kWh)">
                    <input name="creditosUtilizados" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Saldo de Créditos (kWh)">
                    <input name="saldoCreditos" type="number" step="0.01" className={inputClass} />
                  </FormField>
                  <FormField label="Economia (R$)">
                    <input name="economiaGerada" type="number" step="0.01" className={inputClass} />
                  </FormField>
                </div>
                <FormField label="Observações">
                  <textarea name="observacoes" rows={2} className={inputClass} />
                </FormField>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={consumerSaving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {consumerSaving ? "Salvando..." : "Lançar Consumo"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Histórico de Consumo</h2>
                <span className="text-xs text-muted-foreground">
                  {consumerHistory.length} lançamento{consumerHistory.length !== 1 ? "s" : ""}
                </span>
              </div>
              {consumerHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento registrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Consumidor</th>
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Usina</th>
                        <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Período</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Consumo</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Créditos</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Saldo</th>
                        <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Economia</th>
                        <th className="text-center py-2 px-3 font-medium text-xs uppercase tracking-wide">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumerHistory.map((row) => (
                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 font-medium">{row.consumer.name}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{row.plant.name}</td>
                          <td className="py-2.5 px-3">{formatMonthYear(row.mes, row.ano)}</td>
                          <td className="py-2.5 px-3 text-right">{row.consumoTotal ? formatKWh(row.consumoTotal) : "-"}</td>
                          <td className="py-2.5 px-3 text-right">{row.creditosUtilizados ? formatKWh(row.creditosUtilizados) : "-"}</td>
                          <td className="py-2.5 px-3 text-right">{row.saldoCreditos ? formatKWh(row.saldoCreditos) : "-"}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">{row.economiaGerada ? formatBRL(row.economiaGerada) : "-"}</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                              className="inline-flex p-1.5 rounded hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}
