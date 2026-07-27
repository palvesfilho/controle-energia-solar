"use client";

import { useEffect, useState } from "react";
import { FileDown, FileBarChart2, Loader2, ShieldOff } from "lucide-react";
import { brand } from "@/lib/brand-colors";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface MesRef {
  ano: number;
  mes: number;
}

interface UcRelatorio {
  ucId: string;
  codigoUc: string;
  nome: string;
  distribuidora: string | null;
  papel: "TITULAR" | "BENEFICIARIA";
  percentual: number | null;
  ultimaFatura: { anoReferencia: number; mesReferencia: number } | null;
  meses: MesRef[];
}

interface ApiResponse {
  proprietario: { nome: string };
  acessoAtivo: boolean;
  modo: "AGREGADO" | "POR_UC";
  mesesAgregado: MesRef[];
  ucs: UcRelatorio[];
}

const MESES_LONGO = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesKey(m: MesRef) {
  return `${m.ano}-${m.mes}`;
}

/** Monta querystring ignorando valores vazios/indefinidos. */
function buildQs(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

/**
 * Lista de relatórios do cliente.
 *
 * Sem `proprietarioId` → modo cliente: resolve o proprietário pelo usuário Clerk
 * logado (endpoints `/api/portal-cliente/*`). Com `proprietarioId` → modo
 * prévia do pós-venda ("Visão do cliente"): busca pelos endpoints admin
 * (`/api/admin/brasil-solar/portal-preview/*`), protegidos por role.
 */
export function PortalClienteRelatorios({
  proprietarioId,
}: {
  proprietarioId?: string;
} = {}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const preview = Boolean(proprietarioId);
  const previewBase = "/api/admin/brasil-solar/portal-preview";

  const listUrl = preview
    ? `${previewBase}/relatorios${buildQs({ proprietarioId })}`
    : "/api/portal-cliente/relatorios";

  const pdfUcUrl = (ucId: string, m: MesRef | null) =>
    preview
      ? `${previewBase}/relatorios/${ucId}/pdf${buildQs({ proprietarioId, ano: m?.ano, mes: m?.mes })}`
      : `/api/portal-cliente/relatorios/${ucId}/pdf${m ? `?ano=${m.ano}&mes=${m.mes}` : ""}`;

  const pdfAgregadoUrl = (m: MesRef | null) =>
    preview
      ? `${previewBase}/relatorio-agregado/pdf${buildQs({ proprietarioId, ano: m?.ano, mes: m?.mes })}`
      : `/api/portal-cliente/relatorio-agregado/pdf${m ? `?ano=${m.ano}&mes=${m.mes}` : ""}`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(listUrl)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [listUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#8A938D] py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando relatórios…
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-sm text-[#8A938D] py-2">
        Não foi possível carregar seus relatórios agora.
      </p>
    );
  }

  const temAlgum =
    data.modo === "AGREGADO"
      ? data.mesesAgregado.length > 0
      : data.ucs.some((u) => u.meses.length > 0);

  if (!temAlgum) {
    return (
      <p className="text-sm text-[#8A938D] py-2">
        Ainda não há relatórios disponíveis. Assim que a primeira fatura for
        processada, seu relatório mensal aparecerá aqui.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!data.acessoAtivo && (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-sm px-3 py-2 flex items-start gap-2">
          <ShieldOff className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Seu acesso está pendente de pagamento. Após a confirmação, o download
            dos relatórios em PDF é liberado.
          </span>
        </div>
      )}

      {data.modo === "AGREGADO" ? (
        <RelatorioCard
          titulo="Relatório consolidado"
          subtitulo="Todas as suas unidades, com rateio"
          meses={data.mesesAgregado}
          acessoAtivo={data.acessoAtivo}
          pdfUrl={pdfAgregadoUrl}
        />
      ) : (
        data.ucs
          .filter((uc) => uc.meses.length > 0)
          .map((uc) => (
            <RelatorioCard
              key={uc.ucId}
              titulo={uc.nome}
              subtitulo={`UC ${formatCodigoUc(uc.codigoUc)}${uc.distribuidora ? ` · ${uc.distribuidora}` : ""}`}
              meses={uc.meses}
              acessoAtivo={data.acessoAtivo}
              pdfUrl={(m) => pdfUcUrl(uc.ucId, m)}
            />
          ))
      )}
    </div>
  );
}

function RelatorioCard({
  titulo,
  subtitulo,
  meses,
  acessoAtivo,
  pdfUrl,
}: {
  titulo: string;
  subtitulo: string;
  meses: MesRef[];
  acessoAtivo: boolean;
  pdfUrl: (m: MesRef | null) => string;
}) {
  // meses já vem mais recente primeiro; default = primeiro (mais recente).
  const [selKey, setSelKey] = useState<string>(meses.length > 0 ? mesKey(meses[0]) : "");
  const selecionado = meses.find((m) => mesKey(m) === selKey) ?? meses[0] ?? null;

  return (
    <div className="bg-white border border-[#E1EAE7] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: brand.tealMid }}
        >
          <FileBarChart2 className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[#1F1F1F] truncate">{titulo}</div>
          <div className="text-sm text-[#59604F] truncate">{subtitulo}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-wide text-[#8A938D]">
          Mês
        </label>
        <select
          value={selKey}
          onChange={(e) => setSelKey(e.target.value)}
          className="text-sm font-medium rounded-lg border border-[#E1EAE7] bg-white px-2.5 py-1.5 outline-none focus:border-[#2E9B87]"
        >
          {meses.map((m) => (
            <option key={mesKey(m)} value={mesKey(m)}>
              {MESES_LONGO[m.mes - 1]}/{m.ano}
            </option>
          ))}
        </select>

        {acessoAtivo ? (
          <a
            href={pdfUrl(selecionado)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: brand.teal }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = brand.tealDark)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = brand.teal)
            }
          >
            <FileDown className="h-4 w-4" />
            Baixar PDF
          </a>
        ) : (
          <span
            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg text-[#8A938D] bg-[#EDF4F1] cursor-not-allowed"
            title="Acesso pendente de pagamento"
          >
            <FileDown className="h-4 w-4" />
            Baixar PDF
          </span>
        )}
      </div>
    </div>
  );
}
