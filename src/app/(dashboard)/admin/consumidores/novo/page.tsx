"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";

interface PlantOption {
  id: string;
  name: string;
}

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  step,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
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
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
    </div>
  );
}

export default function NovoConsumidorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [selectedPlant, setSelectedPlant] = useState("");

  useEffect(() => {
    fetch("/api/plants")
      .then((res) => res.json())
      .then(setPlants);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());
    if (selectedPlant) {
      data.plantId = selectedPlant;
    }
    if (typeof data.phone === "string" && data.phone && !isValidPhone(data.phone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/consumers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      toast.error("Erro ao criar consumidor", { description: err.error });
      setLoading(false);
      return;
    }

    toast.success("Consumidor criado", { description: "Cadastro salvo com sucesso" });
    router.push("/admin/consumidores");
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin/consumidores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Novo Consumidor</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre um novo cliente consumidor de energia
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do Consumidor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome completo" name="name" required />
              <FormField label="Email" name="email" type="email" />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <PhoneInput name="phone" unstyled />
              </div>
              <FormField label="CPF / CNPJ" name="document" placeholder="000.000.000-00" />
              <FormField
                label="Endereço"
                name="endereco"
                placeholder="Rua, número, bairro, cidade - UF"
                className="sm:col-span-2"
              />
              <FormField
                label="Unidade Consumidora"
                name="unidadeConsumidora"
                placeholder="Número da UC na concessionária"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vincular a Usina (opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Usina</label>
                <select
                  value={selectedPlant}
                  onChange={(e) => setSelectedPlant(e.target.value)}
                  className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  <option value="">Selecione uma usina</option>
                  {plants.map((plant) => (
                    <option key={plant.id} value={plant.id}>
                      {plant.name}
                    </option>
                  ))}
                </select>
              </div>
              <FormField label="Cota de créditos (%)" name="cotaPercent" type="number" step="0.01" placeholder="Ex: 15.00" />
              <FormField label="Desconto na tarifa (%)" name="descontoPercent" type="number" step="0.01" placeholder="Ex: 20.00" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/consumidores"
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Salvando..." : "Criar Consumidor"}
          </button>
        </div>
      </form>
    </div>
  );
}
