"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  DocumentosAdesao,
  type FichaDocumento,
} from "@/components/consumer-units/documentos-adesao";
import { ArrowLeft } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone } from "@/lib/phone";
import { AdditionalEmailsInput } from "@/components/investors/additional-emails-input";
import { CidadeInput } from "@/components/ui/cidade-input";
import { PasswordInput } from "@/components/ui/password-input";

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  minLength,
  className,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {/* Campo de senha ganha o "olho" pra conferir o que foi digitado. */}
      {type === "password" ? (
        <PasswordInput
          name={name}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          wrapperClassName="mt-1"
          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
      ) : (
        <input
          type={type}
          name={name}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          defaultValue={defaultValue}
          className="w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
      )}
    </div>
  );
}

/** Dados da adesao do CRM usados para pre-preencher o cadastro. */
interface UcDoCrm {
  adesaoIdCrm: number;
  envelopeIdCrm: string | null;
  /** Envelope assinado a partir de 21/08/2026 leva também a autorização de acesso. */
  temAutorizacaoAssinada?: boolean;
  assinadoEm: string | null;
  documentos: { id: number; categoria: string | null; nomeArquivo: string; tamanho: number | null }[];
  clienteNome: string;
  clienteDocumento: string | null;
  clienteTipo: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
}

/** As sete fichas, sempre as sete -- a vazia mostra o que falta. */
function montarFichas(uc: UcDoCrm): FichaDocumento[] {
  const porCategoria = new Map((uc.documentos ?? []).map((d) => [d.categoria ?? "", d]));
  const anexo = (cat: string, rotulo: string): FichaDocumento => {
    const d = porCategoria.get(cat);
    return {
      chave: cat,
      rotulo,
      detalhe: d ? d.nomeArquivo : null,
      href: d ? `/api/crm/documento/${d.id}` : null,
    };
  };
  const assinadoEm = uc.assinadoEm ? new Date(uc.assinadoEm).toLocaleDateString("pt-BR") : null;
  return [
    {
      chave: "termo",
      rotulo: "Termo de Adesão",
      detalhe: assinadoEm ? `assinado ${assinadoEm}` : null,
      href: uc.envelopeIdCrm ? `/api/crm/termo/${uc.envelopeIdCrm}` : null,
    },
    {
      chave: "procuracao",
      rotulo: "Procuração",
      detalhe: assinadoEm ? `assinada ${assinadoEm}` : null,
      href: uc.envelopeIdCrm ? `/api/crm/termo/${uc.envelopeIdCrm}?tipo=procuracao` : null,
    },
    {
      chave: "autorizacao",
      rotulo: "Autorização de acesso",
      detalhe: uc.temAutorizacaoAssinada && assinadoEm ? `assinada ${assinadoEm}` : null,
      // Ficha vazia nas adesões anteriores a 21/08/2026: essa autorização ainda
      // precisa ser providenciada à parte, e é isso que o tracejado diz.
      href: uc.envelopeIdCrm && uc.temAutorizacaoAssinada
        ? `/api/crm/termo/${uc.envelopeIdCrm}?tipo=autorizacao`
        : null,
    },
    anexo("identidade", "Identidade"),
    anexo("cartao_cnpj", "Cartão CNPJ"),
    anexo("contrato_social", "Contrato social"),
    anexo("outros", "Outro documento"),
  ];
}

function NovoInvestidorConteudo() {
  const router = useRouter();
  const params = useSearchParams();
  const crmUcId = params.get("crmUc");
  const [loading, setLoading] = useState(false);
  const [crm, setCrm] = useState<UcDoCrm | null>(null);

  // Proprietario de usina vindo da fila do CRM: o cadastro chega preenchido
  // com o que foi ASSINADO no termo, em vez de redigitado.
  useEffect(() => {
    if (!crmUcId) return;
    fetch(`/api/crm/ucs/${crmUcId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        return d as UcDoCrm;
      })
      .then(setCrm)
      // Falhar aqui nao pode travar o cadastro manual: o formulario abre vazio.
      .catch((e: Error) => toast.error(`Nao consegui carregar a adesao: ${e.message}`));
  }, [crmUcId]);

  const ehPJ = crm?.clienteTipo === "PJ";
  const digitos = (crm?.clienteDocumento ?? "").replace(/\D/g, "");

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

    // additionalEmails vem como JSON-string (hidden input do componente)
    if (typeof data.additionalEmails === "string") {
      try {
        data.additionalEmails = JSON.parse(data.additionalEmails);
      } catch {
        data.additionalEmails = [];
      }
    }

    const res = await fetch("/api/investors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const criado = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error("Erro ao criar investidor", { description: criado?.error ?? "Erro desconhecido" });
      setLoading(false);
      return;
    }

    // Tira da fila do CRM e copia os documentos da adesao para dentro do
    // investidor. Se a copia falhar, o vinculo NAO e desfeito -- o aviso diz
    // o que faltou, e o botao pode ser usado de novo.
    const investorId: string | undefined = criado?.investor?.id;
    if (crmUcId && investorId) {
      try {
        const v = await fetch(`/api/crm/ucs/${crmUcId}/vincular`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investorId }),
        });
        const dv = await v.json();
        const d = dv.documentos ?? {};
        const guardados = (d.copiados?.length ?? 0) + (d.reaproveitados?.length ?? 0);
        toast.success(`Proprietario criado - ${guardados} documento(s) guardados nele.`);
        if (d.falhas?.length) toast.warning(`Nao copiados: ${d.falhas.join(" - ")}`);
      } catch (err) {
        toast.warning(
          `Proprietario criado, mas os documentos nao foram copiados: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      router.push("/admin/crm/fila");
      return;
    }

    toast.success("Investidor criado", { description: "Cadastro salvo com sucesso" });
    router.push("/admin/investidores");
  }

  return (
    <div className={crm ? "space-y-4" : "space-y-4 max-w-4xl"}>
      <Link
        href={crmUcId ? "/admin/crm/fila" : "/admin/investidores"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {crmUcId ? "Voltar para a fila do CRM" : "Voltar"}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Novo Investidor</h1>
        <p className="text-sm text-muted-foreground">
          {crm
            ? "Proprietario de usina vindo da adesao assinada no gerador de propostas. Confira antes de salvar."
            : "Cadastre um novo investidor no sistema"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Documentos ao lado dos dados pessoais: sao esses os campos que se
            conferem olhando o papel -- o CPF contra a identidade, o CNPJ
            contra o cartao. Mesma escolha feita no cadastro de UC. */}
        <div
          className={
            crm
              ? "grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)] lg:items-start"
              : undefined
          }
        >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome completo" name="name" required defaultValue={crm?.clienteNome} />
              <FormField label="Email principal" name="email" type="email" required defaultValue={crm?.clienteEmail ?? undefined} />
              <FormField label="Senha inicial" name="password" type="password" required minLength={6} />
              <div className="sm:col-span-2">
                <AdditionalEmailsInput />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <PhoneInput name="phone" unstyled />
              </div>
              <FormField label="CPF" name="cpf" placeholder="000.000.000-00" defaultValue={ehPJ ? undefined : (digitos || undefined)} />
              <FormField label="Data de nascimento" name="dataNascimento" type="date" />
              <FormField label="Endereço" name="endereco" placeholder="Rua, Avenida..." className="sm:col-span-2" defaultValue={crm?.logradouro ?? undefined} />
              <FormField label="Número" name="numero" defaultValue={crm?.numero ?? undefined} />
              <FormField label="Complemento" name="complemento" placeholder="Apto, Sala..." defaultValue={crm?.complemento ?? undefined} />
              <FormField label="CEP" name="cep" placeholder="00000-000" defaultValue={crm?.cep ?? undefined} />
              <FormField label="Bairro" name="bairro" defaultValue={crm?.bairro ?? undefined} />
              <CidadeInput label="Cidade" name="cidade" />
            </div>
          </CardContent>
        </Card>
          {crm && (
            <DocumentosAdesao
              fichas={montarFichas(crm)}
              adesaoIdCrm={crm.adesaoIdCrm}
              copiadosEm={null}
            />
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nome da empresa" name="nomeEmpresa" defaultValue={ehPJ ? crm?.clienteNome : undefined} />
              <FormField label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" defaultValue={ehPJ ? (digitos || undefined) : undefined} />
              <FormField label="Endereço" name="enderecoEmpresa" placeholder="Rua, Avenida..." className="sm:col-span-2" />
              <FormField label="Número" name="numeroEmpresa" />
              <FormField label="Complemento" name="complementoEmpresa" placeholder="Sala, Andar..." />
              <FormField label="CEP" name="cepEmpresa" placeholder="00000-000" />
              <FormField label="Bairro" name="bairroEmpresa" />
              <CidadeInput label="Cidade" name="cidadeEmpresa" />
              <FormField label="Chave PIX" name="chavePix" className="sm:col-span-2" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/admin/investidores"
            className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Salvando..." : "Criar Investidor"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NovoInvestidorPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando…</div>}>
      <NovoInvestidorConteudo />
    </Suspense>
  );
}
