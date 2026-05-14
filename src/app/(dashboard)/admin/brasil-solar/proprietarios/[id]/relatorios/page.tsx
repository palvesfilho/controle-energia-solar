"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileBarChart2, Sun } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { brand } from "@/lib/brand-colors";

interface UC {
  ucId: string;
  codigoUc: string;
  nome: string;
  distribuidora: string | null;
  active: boolean;
  usinasMonitoradas: number;
  potenciaTotalKwp: number;
  investimentoTotal: number;
  ultimaFatura: { anoReferencia: number; mesReferencia: number } | null;
}

interface ApiResponse {
  proprietario: { id: string; nome: string; cidade: string | null; uf: string | null };
  ucs: UC[];
}

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RelatoriosListPage() {
  const params = useParams();
  const proprietarioId = params.id as string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/brasil-solar/proprietarios/${proprietarioId}/relatorios`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [proprietarioId]);

  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando...</p>;
  }
  if (error || !data) {
    return <p className="p-8 text-sm text-red-600">Erro: {error}</p>;
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin/brasil-solar/proprietarios"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para lista de clientes
      </Link>

      <div
        className="rounded-xl p-5 text-white relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brand.tealDark} 0%, ${brand.teal} 60%, ${brand.orange} 100%)`,
        }}
      >
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-widest text-white/80">
            Cliente Brasil Solar
          </p>
          <h1 className="text-2xl font-bold">{data.proprietario.nome}</h1>
          {(data.proprietario.cidade || data.proprietario.uf) && (
            <p className="text-sm text-white/85">
              {[data.proprietario.cidade, data.proprietario.uf]
                .filter(Boolean)
                .join("/")}
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">
          Unidades Consumidoras com relatório disponível
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Selecione a UC para abrir o relatório de geração × consumo dos últimos
          12 meses, com cálculo de payback acumulado.
        </p>
      </div>

      {data.ucs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Este cliente ainda não possui unidades consumidoras vinculadas a usinas monitoradas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.ucs.map((uc) => (
            <Link
              key={uc.ucId}
              href={`/admin/brasil-solar/proprietarios/${proprietarioId}/relatorios/${uc.ucId}`}
              className="block group"
            >
              <Card
                className="transition-all hover:shadow-md"
                style={{ borderColor: `${brand.teal}30` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        UC {uc.codigoUc}
                      </p>
                      <h3 className="font-semibold truncate">{uc.nome}</h3>
                      {uc.distribuidora && (
                        <p className="text-xs text-muted-foreground">
                          {uc.distribuidora}
                        </p>
                      )}
                    </div>
                    <FileBarChart2
                      className="h-5 w-5 flex-shrink-0 transition-colors group-hover:text-emerald-700"
                      style={{ color: brand.teal }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Usinas</div>
                      <div className="font-semibold flex items-center gap-1">
                        <Sun className="h-3 w-3" style={{ color: brand.orange }} />
                        {uc.usinasMonitoradas}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Potência</div>
                      <div className="font-semibold">
                        {uc.potenciaTotalKwp.toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        kWp
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Investimento</div>
                      <div className="font-semibold">
                        {uc.investimentoTotal > 0
                          ? formatBRL(uc.investimentoTotal)
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {uc.ultimaFatura && (
                    <div className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                      Última fatura disponível:{" "}
                      <span className="font-medium text-foreground">
                        {MES_ABREV[uc.ultimaFatura.mesReferencia - 1]}/
                        {uc.ultimaFatura.anoReferencia}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
