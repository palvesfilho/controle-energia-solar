"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";

interface PlantLink {
  id: string;
  cotaPercent: number | null;
  descontoPercent: number | null;
  plant: { id: string; name: string };
}

interface ConsumerData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  endereco: string | null;
  unidadeConsumidora: string | null;
  cpfCnpj: string | null;
  loginPortal: string | null;
  emailsRecebimento: string | null;
  dataCadastro: string | null;
  active: boolean;
  plants: PlantLink[];
}

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

export default function EditarConsumidorPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [consumer, setConsumer] = useState<ConsumerData | null>(null);
  const [allPlants, setAllPlants] = useState<PlantOption[]>([]);
  const [newPlantId, setNewPlantId] = useState("");
  const [addingPlant, setAddingPlant] = useState(false);

  useEffect(() => {
    fetch(`/api/consumers/${params.id}`)
      .then((res) => res.json())
      .then(setConsumer);
    fetch("/api/plants")
      .then((res) => res.json())
      .then(setAllPlants);
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    if (typeof data.phone === "string" && data.phone && !isValidPhone(data.phone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/consumers/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      toast.error("Erro ao atualizar consumidor", { description: err.error });
      setLoading(false);
      return;
    }

    toast.success("Consumidor atualizado", { description: "Alterações salvas com sucesso" });
    router.push("/admin/consumidores");
  }

  async function handleUpdatePlantLink(link: PlantLink, formData: FormData) {
    const data = Object.fromEntries(formData.entries());

    const res = await fetch(`/api/consumers/${params.id}/plants/${link.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      toast.error("Erro ao atualizar vínculo");
      return;
    }

    toast.success("Vínculo atualizado");
  }

  async function handleRemovePlantLink(linkId: string) {
    if (!confirm("Tem certeza que deseja desvincular esta usina?")) return;

    const res = await fetch(`/api/consumers/${params.id}/plants/${linkId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      toast.error("Erro ao remover vínculo");
      return;
    }

    setConsumer((prev) =>
      prev ? { ...prev, plants: prev.plants.filter((p) => p.id !== linkId) } : null
    );
    toast.success("Usina desvinculada");
  }

  async function handleAddPlant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPlantId) return;
    setAddingPlant(true);

    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());
    data.plantId = newPlantId;

    const res = await fetch(`/api/consumers/${params.id}/plants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      toast.error("Erro ao vincular usina", { description: err.error });
      setAddingPlant(false);
      return;
    }

    toast.success("Usina vinculada");
    setNewPlantId("");
    setAddingPlant(false);

    const updated = await fetch(`/api/consumers/${params.id}`).then((r) => r.json());
    setConsumer(updated);
  }

  if (!consumer) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const linkedPlantIds = consumer.plants.map((p) => p.plant.id);
  const availablePlants = allPlants.filter((p) => !linkedPlantIds.includes(p.id));

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
        <h1 className="text-2xl font-bold">Editar Consumidor</h1>
        <p className="text-sm text-muted-foreground">{consumer.name}</p>
      </div>

      <form key={consumer.id} onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados do Consumidor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome completo" name="name" defaultValue={consumer.name} required />
              <FormField
                label="CPF / CNPJ"
                name="cpfCnpj"
                defaultValue={consumer.cpfCnpj ?? consumer.document ?? ""}
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <PhoneInput name="phone" defaultValue={consumer.phone ?? ""} unstyled />
              </div>
              <FormField label="Email (contato)" name="email" type="email" defaultValue={consumer.email ?? ""} />
              <FormField
                label="Emails de recebimento"
                name="emailsRecebimento"
                defaultValue={consumer.emailsRecebimento ?? ""}
                placeholder="separados por ;"
                className="sm:col-span-2"
              />
              <FormField
                label="Endereço"
                name="endereco"
                defaultValue={consumer.endereco ?? ""}
                className="sm:col-span-2"
              />
              <FormField
                label="Login portal da concessionária"
                name="loginPortal"
                defaultValue={consumer.loginPortal ?? ""}
              />
              <FormField
                label="Data de cadastro"
                name="dataCadastro"
                type="date"
                defaultValue={
                  consumer.dataCadastro ? consumer.dataCadastro.slice(0, 10) : ""
                }
              />
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
            {loading ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </form>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Usinas Vinculadas</h2>

        {consumer.plants.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma usina vinculada a este consumidor.
            </CardContent>
          </Card>
        ) : (
          consumer.plants.map((link) => (
            <Card key={link.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{link.plant.name}</CardTitle>
                  <button
                    onClick={() => handleRemovePlantLink(link.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desvincular
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleUpdatePlantLink(link, new FormData(e.currentTarget));
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField
                      label="Cota de créditos (%)"
                      name="cotaPercent"
                      type="number"
                      step="0.01"
                      defaultValue={link.cotaPercent ?? ""}
                    />
                    <FormField
                      label="Desconto na tarifa (%)"
                      name="descontoPercent"
                      type="number"
                      step="0.01"
                      defaultValue={link.descontoPercent ?? ""}
                    />
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
                    >
                      Atualizar vínculo
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ))
        )}

        {availablePlants.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vincular Nova Usina</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddPlant}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Usina</label>
                    <select
                      value={newPlantId}
                      onChange={(e) => setNewPlantId(e.target.value)}
                      className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="">Selecione</option>
                      {availablePlants.map((plant) => (
                        <option key={plant.id} value={plant.id}>
                          {plant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <FormField label="Cota (%)" name="cotaPercent" type="number" step="0.01" placeholder="Ex: 15.00" />
                  <FormField label="Desconto (%)" name="descontoPercent" type="number" step="0.01" placeholder="Ex: 20.00" />
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    type="submit"
                    disabled={addingPlant || !newPlantId}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    {addingPlant ? "Vinculando..." : "Vincular Usina"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}
