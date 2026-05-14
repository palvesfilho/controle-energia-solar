"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { AdditionalEmailsInput } from "@/components/investors/additional-emails-input";

interface InvestorData {
  id: string;
  phone: string | null;
  document: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cep: string | null;
  bairro: string | null;
  cidade: string | null;
  nomeEmpresa: string | null;
  cnpj: string | null;
  enderecoEmpresa: string | null;
  numeroEmpresa: string | null;
  complementoEmpresa: string | null;
  cepEmpresa: string | null;
  bairroEmpresa: string | null;
  cidadeEmpresa: string | null;
  chavePix: string | null;
  additionalEmails: string | null;
  user: { id: string; email: string; name: string; active: boolean };
}

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  className,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
      />
    </div>
  );
}

export default function EditarInvestidorPage() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [investor, setInvestor] = useState<InvestorData | null>(null);

  useEffect(() => {
    fetch(`/api/investors/${params.id}`)
      .then((res) => res.json())
      .then(setInvestor);
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());

    if (typeof data.phone === "string" && data.phone && !isValidPhone(data.phone)) {
      toast.error("Telefone inválido. Use (XX)XXXXX-XXXX");
      setLoading(false);
      return;
    }

    if (typeof data.additionalEmails === "string") {
      try {
        data.additionalEmails = JSON.parse(data.additionalEmails);
      } catch {
        data.additionalEmails = [];
      }
    }

    const res = await fetch(`/api/investors/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      toast.error("Erro ao atualizar investidor", { description: err.error });
      setLoading(false);
      return;
    }

    toast.success("Investidor atualizado", { description: "Alterações salvas com sucesso" });
    router.push(`/admin/investidores/${params.id}`);
  }

  if (!investor) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const dataNascFormatted = investor.dataNascimento
    ? new Date(investor.dataNascimento).toISOString().split("T")[0]
    : "";

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href={`/admin/investidores/${params.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para detalhes
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Editar Investidor</h1>
        <p className="text-sm text-muted-foreground">{investor.user.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome completo" name="name" defaultValue={investor.user.name} required />
              <FormField label="Email principal" name="email" type="email" defaultValue={investor.user.email} required />
              <div className="sm:col-span-2">
                <AdditionalEmailsInput
                  defaultValue={
                    investor.additionalEmails
                      ? (() => {
                          try {
                            const v = JSON.parse(investor.additionalEmails);
                            return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
                          } catch {
                            return [];
                          }
                        })()
                      : []
                  }
                />
              </div>
              <FormField label="CPF" name="cpf" defaultValue={investor.cpf ?? ""} placeholder="000.000.000-00" />
              <FormField label="Data de nascimento" name="dataNascimento" type="date" defaultValue={dataNascFormatted} />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <PhoneInput name="phone" defaultValue={investor.phone ?? ""} unstyled />
              </div>
              <FormField label="Endereço" name="endereco" defaultValue={investor.endereco ?? ""} placeholder="Rua, Avenida..." className="sm:col-span-2" />
              <FormField label="Número" name="numero" defaultValue={investor.numero ?? ""} />
              <FormField label="Complemento" name="complemento" defaultValue={investor.complemento ?? ""} placeholder="Apto, Sala..." />
              <FormField label="CEP" name="cep" defaultValue={investor.cep ?? ""} placeholder="00000-000" />
              <FormField label="Bairro" name="bairro" defaultValue={investor.bairro ?? ""} />
              <FormField label="Cidade" name="cidade" defaultValue={investor.cidade ?? ""} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome da empresa" name="nomeEmpresa" defaultValue={investor.nomeEmpresa ?? ""} />
              <FormField label="CNPJ" name="cnpj" defaultValue={investor.cnpj ?? ""} placeholder="00.000.000/0000-00" />
              <FormField label="Endereço" name="enderecoEmpresa" defaultValue={investor.enderecoEmpresa ?? ""} placeholder="Rua, Avenida..." className="sm:col-span-2" />
              <FormField label="Número" name="numeroEmpresa" defaultValue={investor.numeroEmpresa ?? ""} />
              <FormField label="Complemento" name="complementoEmpresa" defaultValue={investor.complementoEmpresa ?? ""} placeholder="Sala, Andar..." />
              <FormField label="CEP" name="cepEmpresa" defaultValue={investor.cepEmpresa ?? ""} placeholder="00000-000" />
              <FormField label="Bairro" name="bairroEmpresa" defaultValue={investor.bairroEmpresa ?? ""} />
              <FormField label="Cidade" name="cidadeEmpresa" defaultValue={investor.cidadeEmpresa ?? ""} />
              <FormField label="Chave PIX" name="chavePix" defaultValue={investor.chavePix ?? ""} className="sm:col-span-2" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href={`/admin/investidores/${params.id}`}
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
    </div>
  );
}
