"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Monitor, Zap } from "lucide-react";
import Link from "next/link";
import { CONCESSIONARIAS } from "@/lib/concessionarias";

interface InvestorOption {
  id: string;
  user: { name: string };
}

const INVERSOR_MARCAS: Record<string, string[]> = {
  "Growatt": [
    "MIC 600TL-X", "MIC 750TL-X", "MIC 1000TL-X", "MIC 1500TL-X", "MIC 2000TL-X", "MIC 2500TL-X", "MIC 3000TL-X",
    "MIN 2500TL-X", "MIN 3000TL-X", "MIN 3600TL-X", "MIN 4200TL-X", "MIN 4600TL-X", "MIN 5000TL-X", "MIN 6000TL-X",
    "MOD 3000TL3-X", "MOD 4000TL3-X", "MOD 5000TL3-X", "MOD 6000TL3-X", "MOD 7000TL3-X", "MOD 8000TL3-X", "MOD 10KTL3-X",
    "MAC 25KTL3-X", "MAC 30KTL3-X", "MAC 36KTL3-X", "MAC 40KTL3-X", "MAC 50KTL3-X", "MAC 60KTL3-XH",
    "MAX 50KTL3 LV", "MAX 60KTL3 LV", "MAX 70KTL3 LV", "MAX 75KTL3 LV", "MAX 80KTL3 LV", "MAX 100KTL3 LV",
  ],
  "Huawei": [
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
  "Sungrow": [
    "SG2K-S", "SG3K-S", "SG4K-D", "SG5K-D", "SG6K-D", "SG7K-D", "SG8K-D", "SG10K-D",
    "SG12KTL-M", "SG15KTL-M", "SG20KTL-M", "SG25KTL-M",
    "SG30KTL-M", "SG33KTL-M", "SG36KTL-M", "SG40KTL-M", "SG50KTL-M-20",
    "SG60KTL-M", "SG75KTL", "SG100KTL", "SG110KTL-M", "SG125KTL-M",
  ],
  "Fronius": [
    "Primo 3.0-1", "Primo 3.5-1", "Primo 3.6-1", "Primo 4.0-1", "Primo 4.6-1", "Primo 5.0-1", "Primo 6.0-1", "Primo 8.2-1",
    "Symo 10.0-3-M", "Symo 12.5-3-M", "Symo 15.0-3-M", "Symo 17.5-3-M", "Symo 20.0-3-M",
    "Tauro ECO 50-3-D", "Tauro ECO 100-3-D",
  ],
  "Deye": [
    "SUN-3K-G", "SUN-4K-G", "SUN-5K-G", "SUN-6K-G", "SUN-7K-G", "SUN-8K-G", "SUN-10K-G", "SUN-12K-G",
    "SUN-15K-G", "SUN-20K-G", "SUN-25K-G", "SUN-30K-G", "SUN-33K-G", "SUN-36K-G", "SUN-40K-G", "SUN-50K-G",
  ],
  "ABB/FIMER": [
    "UNO-DM-1.2-TL-PLUS", "UNO-DM-2.0-TL-PLUS", "UNO-DM-3.0-TL-PLUS", "UNO-DM-3.3-TL-PLUS", "UNO-DM-4.0-TL-PLUS", "UNO-DM-5.0-TL-PLUS", "UNO-DM-6.0-TL-PLUS",
    "PVS-10-TL", "PVS-12.5-TL", "PVS-20-TL", "PVS-33-TL",
    "PVS-50-TL", "PVS-100-TL",
  ],
  "GoodWe": [
    "GW2000-NS", "GW2500-NS", "GW3000-NS", "GW3600-NS",
    "GW5000-DT", "GW6000-DT", "GW8000-DT", "GW10000-DT",
    "GW25K-MT", "GW30K-MT", "GW36K-MT", "GW40K-MT", "GW50K-MT",
  ],
  "SolaX": [
    "X1-Mini 0.7", "X1-Mini 1.1", "X1-Mini 1.5", "X1-Mini 2.0", "X1-Mini 2.5", "X1-Mini 3.0",
    "X1-Boost 3.0", "X1-Boost 3.3", "X1-Boost 3.6", "X1-Boost 4.2", "X1-Boost 5.0",
    "X3-MIC 4.0T", "X3-MIC 5.0T", "X3-MIC 6.0T", "X3-MIC 8.0T", "X3-MIC 10.0T", "X3-MIC 15.0T",
    "X3-Mega G2 30K", "X3-Mega G2 40K", "X3-Mega G2 50K",
  ],
  "BYD": [
    "BHM 3.0", "BHM 4.0", "BHM 5.0", "BHM 6.0",
    "BHT 8.0", "BHT 10.0", "BHT 12.0", "BHT 15.0", "BHT 20.0",
  ],
  "Outro": [],
};

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

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  step,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string | number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        defaultValue={defaultValue}
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
      >
        <option value="">{placeholder ?? "Selecione"}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function NovaUsinaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState("");
  const [selectedMarca, setSelectedMarca] = useState("");
  const [selectedModelo, setSelectedModelo] = useState("");
  const [selectedPlataforma, setSelectedPlataforma] = useState("");
  const [showSenha, setShowSenha] = useState(false);

  useEffect(() => {
    fetch("/api/investors")
      .then((res) => res.json())
      .then(setInvestors);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());
    if (selectedInvestor) data.investorId = selectedInvestor;
    if (selectedMarca) data.inversorMarca = selectedMarca;
    if (selectedModelo) data.inversorModelo = selectedModelo;
    if (selectedPlataforma) data.monitoramentoPlataforma = selectedPlataforma;
    // checkbox de form vem como "on" — converte pra boolean explícito
    data.usinaDeInvestidor = formData.get("usinaDeInvestidor") === "on";

    const res = await fetch("/api/plants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      toast.error("Erro ao criar usina", { description: err.error });
      setLoading(false);
      return;
    }

    toast.success("Usina criada", { description: "Cadastro salvo com sucesso" });
    router.push("/admin/usinas");
  }

  const marcaHasModelos =
    selectedMarca && selectedMarca !== "Outro" && INVERSOR_MARCAS[selectedMarca]?.length > 0;

  return (
    <div className="space-y-4 max-w-6xl">
      <Link
        href="/admin/usinas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Nova Usina</h1>
        <p className="text-sm text-muted-foreground">Cadastre uma nova usina solar</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dados da Usina</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Nome da usina" name="name" required placeholder="Ex: Usina Solar Centro" />
                  <FormField label="Localização" name="location" placeholder="Cidade, Estado" />
                  <FormField label="Potência Módulos (kWp)" name="potenciaModulos" type="number" step="0.01" />
                  <FormField label="Potência Inversor (kW)" name="potenciaInversor" type="number" step="0.01" />
                  <FormField label="Geração Média Mensal (kWh)" name="geracaoMediaMensal" type="number" step="0.01" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Enquadramento
                    </label>
                    <select
                      name="enquadramento"
                      defaultValue=""
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="">Selecione</option>
                      <option value="GD1">GD1</option>
                      <option value="GD2">GD2</option>
                    </select>
                  </div>
                  <FormField label="Unidade Consumidora" name="unidadeConsumidora" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Concessionária
                    </label>
                    <select
                      name="concessionaria"
                      defaultValue=""
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="">Selecione</option>
                      {CONCESSIONARIAS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Formato de Leitura
                    </label>
                    <select
                      name="formatoLeitura"
                      defaultValue=""
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="">Selecione</option>
                      <option value="MENSAL">Mensal</option>
                      <option value="PLURIMENSAL">Plurimensal</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vincular Investidor (opcional)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Investidor</label>
                    <select
                      value={selectedInvestor}
                      onChange={(e) => setSelectedInvestor(e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="">Selecione um investidor</option>
                      {investors.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <FormField label="Participação (%)" name="sharePercent" type="number" step="0.01" defaultValue="100" />
                  <FormField label="Valor kWh Contrato (R$)" name="valorKwhContrato" type="number" step="0.01" placeholder="Ex: 0.63" />
                  <FormField label="Gestão Fixa Mensal (R$)" name="gestaoFixaContrato" type="number" step="0.01" placeholder="Ex: 250.00" />
                  <FormField
                    label="Data de assinatura do contrato"
                    name="dataAssinaturaContrato"
                    type="date"
                    className="sm:col-span-2"
                  />
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-md border bg-muted/30 p-3">
                    <input
                      type="checkbox"
                      name="usinaDeInvestidor"
                      id="usinaDeInvestidor"
                      defaultChecked={false}
                      className="mt-0.5"
                    />
                    <label htmlFor="usinaDeInvestidor" className="text-sm cursor-pointer flex-1">
                      <span className="font-medium">Usina de investidor</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Marque se esta usina entra no fluxo da Gestora de Energia (Clientes / Faturas / Faturamento). Usinas sem essa marcação ficam apenas na área Rede Brasil Solar.
                      </p>
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Quem paga a fatura de energia?
                    </label>
                    <select
                      name="pagadorFaturaEnergia"
                      defaultValue="GESTORA"
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="GESTORA">Gestora de Energia</option>
                      <option value="INVESTIDORES">Investidores (pagam direto)</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Quando o investidor paga, a fatura aparece só pra controle — não entra na rotina de pagamento da gestora.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Define o início da janela de faturas a descontar no primeiro relatório do investidor.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Dados do Inversor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SelectField
                  label="Marca do Inversor"
                  value={selectedMarca}
                  onChange={(v) => {
                    setSelectedMarca(v);
                    setSelectedModelo("");
                  }}
                  options={Object.keys(INVERSOR_MARCAS)}
                  placeholder="Selecione a marca"
                />
                {marcaHasModelos ? (
                  <SelectField
                    label="Modelo do Inversor"
                    value={selectedModelo}
                    onChange={setSelectedModelo}
                    options={INVERSOR_MARCAS[selectedMarca]}
                    placeholder="Selecione o modelo"
                  />
                ) : (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Modelo do Inversor</label>
                    <input
                      value={selectedModelo}
                      onChange={(e) => setSelectedModelo(e.target.value)}
                      placeholder={selectedMarca === "Outro" ? "Digite o modelo" : "Selecione a marca primeiro"}
                      disabled={!selectedMarca}
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-blue-600" />
                  Acesso ao Monitoramento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SelectField
                  label="Plataforma de Monitoramento"
                  value={selectedPlataforma}
                  onChange={setSelectedPlataforma}
                  options={PLATAFORMAS_MONITORAMENTO}
                  placeholder="Selecione a plataforma"
                />
                <FormField label="URL do Portal" name="monitoramentoUrl" placeholder="https://..." />
                <FormField label="Login / Email" name="monitoramentoLogin" placeholder="usuario@email.com" />
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Senha</label>
                  <div className="relative mt-1">
                    <input
                      name="monitoramentoSenha"
                      type={showSenha ? "text" : "password"}
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
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/usinas"
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Salvando..." : "Criar Usina"}
          </button>
        </div>
      </form>
    </div>
  );
}
