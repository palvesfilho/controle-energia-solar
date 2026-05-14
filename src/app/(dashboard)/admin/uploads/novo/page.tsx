"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Brain,
  Check,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import Link from "next/link";

type Step = "upload" | "analyzing" | "preview" | "saving";

interface AIRecord {
  investorName: string;
  ano: number;
  mes: number;
  injecaoPeriodo: number;
  creditosAnteriores: number;
  creditosUtilizados: number;
  consumoInstantaneo: number;
  autoConsumoUsina: number;
  creditosAtuais: number;
  creditosVencer: number;
  creditosUtilizadosFin: number;
  valorKwhContrato: number;
  valorBrutoGerador: number;
  gestaoMensalFixa: number;
  taxaMinimaConc: number;
  inadimplencia: number;
  multasOutros: number;
  remuneracaoPeriodo: number;
  observacoes: string | null;
}

interface Validation {
  recordIndex: number;
  field: string;
  severity: "info" | "warning" | "error";
  message: string;
  suggestedValue: number | null;
}

interface AIAnalysis {
  mapping: Record<string, string>;
  records: AIRecord[];
  validations: Validation[];
  summary: string;
}

export default function UploadNovoPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [sheetsData, setSheetsData] = useState<Record<string, unknown[][]> | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setStep("analyzing");
    setProgress(20);

    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!uploadRes.ok) {
      toast.error("Erro ao fazer upload do arquivo");
      setStep("upload");
      return;
    }

    const uploadData = await uploadRes.json();
    setUploadId(uploadData.id);
    setSheetsData(uploadData.sheets);
    setProgress(50);

    const aiRes = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetsData: uploadData.sheets }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.json();
      toast.error(err.error || "Erro na análise com IA");
      setStep("preview");
      setProgress(100);
      return;
    }

    const aiData = await aiRes.json();
    setAnalysis(aiData);
    setProgress(100);
    setStep("preview");
    toast.success("Análise concluída!");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  async function handleSave(publish: boolean) {
    if (!analysis?.records?.length) {
      toast.error("Nenhum registro para salvar");
      return;
    }

    setStep("saving");

    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reports: analysis.records,
        uploadId,
      }),
    });

    if (!res.ok) {
      toast.error("Erro ao salvar relatórios");
      setStep("preview");
      return;
    }

    const data = await res.json();

    if (publish && data.ids?.length > 0) {
      for (const id of data.ids) {
        await fetch(`/api/reports/${id}/publish`, { method: "POST" });
      }
    }

    toast.success(
      `${data.created} relatório(s) ${publish ? "publicado(s)" : "salvo(s) como rascunho"}!`
    );
    router.push("/admin/relatorios");
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Upload de Dados</h1>
        <p className="text-sm text-muted-foreground">
          Importe uma planilha Excel com os dados mensais dos investidores
        </p>
      </div>

      {step !== "upload" && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Upload</span>
            <span className={step === "analyzing" ? "text-primary font-medium" : ""}>
              Análise IA
            </span>
            <span className={step === "preview" ? "text-primary font-medium" : ""}>
              Revisão
            </span>
            <span className={step === "saving" ? "text-primary font-medium" : ""}>
              Salvar
            </span>
          </div>
        </div>
      )}

      {step === "upload" && (
        <Card>
          <CardContent className="p-8">
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors cursor-pointer ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-slate-300 bg-slate-50 hover:border-primary hover:bg-primary/5 dark:bg-slate-900/40"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 text-slate-400" />
              <p className="mt-4 text-lg font-medium">
                {isDragActive
                  ? "Solte o arquivo aqui..."
                  : "Arraste o arquivo Excel aqui"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ou clique para selecionar (.xlsx, .xls)
              </p>
              <button
                type="button"
                className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
              >
                Selecionar arquivo
              </button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground text-center">
              A IA irá identificar automaticamente as colunas da sua planilha e mapear para os campos do relatório.
            </p>
          </CardContent>
        </Card>
      )}

      {step === "analyzing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="mt-4 text-lg font-medium">
              Analisando planilha com IA...
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {fileName}
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              Identificando colunas, extraindo dados e validando consistência
            </p>
          </CardContent>
        </Card>
      )}

      {step === "preview" && analysis && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold">Resumo da Análise IA</h2>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.summary}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {analysis.records.length} registro(s)
                </Badge>
                {analysis.validations.filter((v) => v.severity === "warning").length > 0 && (
                  <Badge className="gap-1 bg-amber-500 hover:bg-amber-600 text-white">
                    <AlertTriangle className="h-3 w-3" />
                    {analysis.validations.filter((v) => v.severity === "warning").length} aviso(s)
                  </Badge>
                )}
                {analysis.validations.filter((v) => v.severity === "error").length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {analysis.validations.filter((v) => v.severity === "error").length} erro(s)
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {analysis.validations.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="text-sm font-semibold">Validações</h2>
                <div className="space-y-2">
                  {analysis.validations.map((v, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                        v.severity === "error"
                          ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                          : v.severity === "warning"
                            ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      }`}
                    >
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">
                          Registro {v.recordIndex + 1} — {v.field}:
                        </span>{" "}
                        {v.message}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Dados extraídos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Investidor</th>
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase tracking-wide">Período</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Injeção</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Valor bruto</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Gestão</th>
                      <th className="text-right py-2 px-3 font-medium text-xs uppercase tracking-wide">Remuneração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.records.map((record, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{record.investorName}</td>
                        <td className="py-2.5 px-3">{`${String(record.mes).padStart(2, "0")}/${record.ano}`}</td>
                        <td className="py-2.5 px-3 text-right">{record.injecaoPeriodo?.toLocaleString("pt-BR")} kWh</td>
                        <td className="py-2.5 px-3 text-right">R$ {record.valorBrutoGerador?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right">R$ {record.gestaoMensalFixa?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-emerald-600">R$ {record.remuneracaoPeriodo?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => { setStep("upload"); setAnalysis(null); }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
            >
              Salvar como rascunho
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Check className="h-4 w-4" />
              Salvar e publicar
            </button>
          </div>
        </div>
      )}

      {step === "saving" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="mt-4 text-lg font-medium">Salvando relatórios...</p>
          </CardContent>
        </Card>
      )}

      {step === "preview" && !analysis && sheetsData && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Dados brutos da planilha</h2>
            <p className="text-sm text-muted-foreground">
              A análise com IA não está disponível. Configure sua OPENAI_API_KEY no arquivo .env para habilitar o mapeamento automático.
            </p>
            <div className="overflow-x-auto">
              {Object.entries(sheetsData).map(([sheetName, rows]) => (
                <div key={sheetName} className="mb-4">
                  <h3 className="text-sm font-medium mb-2">Aba: {sheetName}</h3>
                  <table className="w-full text-xs border">
                    <tbody>
                      {(rows as unknown[][]).slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-b">
                          {(row as unknown[]).map((cell, j) => (
                            <td key={j} className="py-1 px-2 border-r">
                              {String(cell ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
