"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { UCForm, UCFormData } from "@/components/consumer-units/uc-form";
import { descontoParaInputPercentCobrado } from "@/lib/crm-desconto";
import {
  DocumentosAdesao,
  type FichaDocumento,
} from "@/components/consumer-units/documentos-adesao";

interface UcDoCrm {
  id: string;
  adesaoIdCrm: number;
  codigoUc: string;
  codigoUcBruto: string | null;
  mediaMensalKwh: number | null;
  /** Desconto COMBINADO na proposta (15 = 15% off). Null = a proposta não disse. */
  descontoPercent: number | null;
  planoContrato: string | null;
  fidelidadeMeses: number | null;
  /** Quem FECHOU o negócio (vendedor da proposta), nome completo. */
  vendedorNome: string | null;
  /** Quem gerou o termo, quando NÃO é a mesma pessoa. */
  vendedorAdesaoNome: string | null;
  clienteNome: string;
  clienteDocumento: string | null;
  clienteEmail: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  concessionaria: string | null;
  assinadoEm: string | null;
  envelopeIdCrm: string | null;
  documentos: { id: number; categoria: string | null; nomeArquivo: string; tamanho: number | null }[];
  consumidor: { id: string; name: string } | null;
}

/** As seis fichas, sempre as seis — a vazia mostra o que falta. */
function montarFichas(uc: UcDoCrm): FichaDocumento[] {
  const porCategoria = new Map(uc.documentos.map((d) => [d.categoria ?? "", d]));
  const anexo = (cat: string, rotulo: string): FichaDocumento => {
    const d = porCategoria.get(cat);
    return {
      chave: cat,
      rotulo,
      detalhe: d ? d.nomeArquivo : null,
      href: d ? `/api/crm/documento/${d.id}` : null,
    };
  };
  const assinadoEm = uc.assinadoEm
    ? new Date(uc.assinadoEm).toLocaleDateString("pt-BR")
    : null;

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
    anexo("identidade", "Identidade"),
    anexo("cartao_cnpj", "Cartão CNPJ"),
    anexo("contrato_social", "Contrato social"),
    anexo("outros", "Outro documento"),
  ];
}

function NovaUCConteudo() {
  const router = useRouter();
  const params = useSearchParams();
  const crmUcId = params.get("crmUc");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ucCrm, setUcCrm] = useState<UcDoCrm | null>(null);
  const [carregandoCrm, setCarregandoCrm] = useState(Boolean(crmUcId));

  useEffect(() => {
    if (!crmUcId) return;
    fetch(`/api/crm/ucs/${crmUcId}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        return d as UcDoCrm;
      })
      .then(setUcCrm)
      .catch((err: Error) => {
        // Falhar aqui não pode impedir o cadastro manual: o formulário abre
        // vazio e o operador segue, sabendo por quê.
        toast.error(`Não consegui carregar a adesão: ${err.message}`);
      })
      .finally(() => setCarregandoCrm(false));
  }, [crmUcId]);

  const handleSubmit = useCallback(
    async (data: UCFormData) => {
      setError("");
      setSaving(true);
      try {
        const res = await fetch("/api/consumer-units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const criada = await res.json();
        if (!res.ok) {
          setError(criada.error || "Erro ao criar UC");
          return;
        }

        // Vincula e copia os documentos. A UC já existe a esta altura; se a
        // cópia falhar, ela NÃO é desfeita — o aviso diz o que faltou.
        if (crmUcId && criada?.id) {
          try {
            const v = await fetch(`/api/crm/ucs/${crmUcId}/vincular`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ consumerUnitId: criada.id }),
            });
            const dv = await v.json();
            const d = dv.documentos ?? {};
            const guardados = (d.copiados?.length ?? 0) + (d.reaproveitados?.length ?? 0);
            toast.success(`UC criada · ${guardados} documento(s) guardados nela.`);
            if (d.falhas?.length) toast.warning(`Não copiados: ${d.falhas.join(" · ")}`);
          } catch (err) {
            toast.warning(
              `UC criada, mas os documentos não foram copiados: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }

        router.push("/admin/unidades-consumidoras");
      } catch {
        setError("Erro de conexão");
      } finally {
        setSaving(false);
      }
    },
    [crmUcId, router],
  );

  const voltarPara = crmUcId ? "/admin/crm/fila" : "/admin/unidades-consumidoras";

  const initialData: Partial<UCFormData> | undefined = ucCrm
    ? {
        nome: ucCrm.clienteNome,
        codigoUc: ucCrm.codigoUcBruto || ucCrm.codigoUc,
        cpfCnpj: ucCrm.clienteDocumento ?? "",
        distribuidora: ucCrm.concessionaria ?? "",
        consumoMedio: ucCrm.mediaMensalKwh != null ? String(ucCrm.mediaMensalKwh) : "",
        // O desconto que o vendedor combinou na apresentação da proposta. O
        // campo do form é a fatia COBRADA (85 para 15% de desconto) — a
        // conversão é de `lib/crm-desconto.ts`, nunca feita à mão aqui.
        //
        // A bandeira recebe o mesmo percentual: deixá-la em branco faria o
        // cálculo cobrar ZERO de bandeira em silêncio (billing-calculator só
        // soma a parcela quando `percentBandeira` existe). Foi assim que as
        // duas UCs do CRM já cadastradas à mão foram preenchidas.
        percentCompensado: descontoParaInputPercentCobrado(ucCrm.descontoPercent),
        percentBandeira: descontoParaInputPercentCobrado(ucCrm.descontoPercent),
        // Marco zero = data em que o termo foi assinado. É a única data que o
        // CRM tem; se a regra do contrato for outra, o operador corrige aqui.
        dataInicioContrato: ucCrm.assinadoEm ? ucCrm.assinadoEm.slice(0, 10) : "",
        cep: ucCrm.cep ?? "",
        logradouro: ucCrm.logradouro ?? "",
        numero: ucCrm.numero ?? "",
        complemento: ucCrm.complemento ?? "",
        cidade: ucCrm.cidade ?? "",
        consumerId: ucCrm.consumidor?.id ?? "",
      }
    : undefined;

  return (
    <div className={crmUcId ? "space-y-4" : "space-y-4 max-w-4xl"}>
      <Link
        href={voltarPara}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {crmUcId ? "Voltar para a fila do CRM" : "Voltar"}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Nova Unidade Consumidora</h1>
        <p className="text-sm text-muted-foreground">
          {ucCrm
            ? "Vinda da adesão assinada no gerador de propostas. Confira os campos contra os documentos ao lado antes de salvar."
            : carregandoCrm
              ? "Carregando a adesão…"
              : "Cadastre uma nova UC no sistema"}
        </p>
      </div>

      {ucCrm && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            ucCrm.descontoPercent != null
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
        >
          {ucCrm.descontoPercent != null ? (
            <>
              <strong>Desconto combinado na proposta: {ucCrm.descontoPercent}%</strong>
              {ucCrm.planoContrato ? ` · plano ${ucCrm.planoContrato}` : ""}
              {ucCrm.fidelidadeMeses != null ? ` · fidelidade ${ucCrm.fidelidadeMeses} meses` : ""}
              {" — já preenchido abaixo como Desconto de Contrato de "}
              {descontoParaInputPercentCobrado(ucCrm.descontoPercent)}% cobrados sobre a energia
              compensada.
              {ucCrm.vendedorNome && (
                <>
                  {" "}
                  Vendida por <strong>{ucCrm.vendedorNome}</strong>
                  {ucCrm.vendedorAdesaoNome && ` (termo gerado por ${ucCrm.vendedorAdesaoNome})`}.
                </>
              )}
            </>
          ) : (
            <>
              <strong>A proposta não trouxe o desconto combinado.</strong> Os campos de desconto
              ficaram em branco de propósito — preencha com o que foi acordado, senão a cobrança
              não é calculada.
              {ucCrm.vendedorNome && (
                <> Quem fechou o negócio foi <strong>{ucCrm.vendedorNome}</strong>.</>
              )}
            </>
          )}
        </div>
      )}

      {/* `key` força o formulário a remontar quando os dados do CRM chegam:
          sem isso, o estado inicial ficaria congelado no vazio. */}
      <UCForm
        key={ucCrm?.id ?? "vazio"}
        initialData={initialData}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        cancelHref={voltarPara}
        submitLabel="Criar UC"
        painelLateral={
          ucCrm ? (
            <DocumentosAdesao
              fichas={montarFichas(ucCrm)}
              adesaoIdCrm={ucCrm.adesaoIdCrm}
              copiadosEm={null}
            />
          ) : undefined
        }
      />
    </div>
  );
}

export default function NovaUCPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando…</div>}>
      <NovaUCConteudo />
    </Suspense>
  );
}
