"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, FileText, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface ImportRow {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  observacoes?: string;
}

interface ImportResult {
  message: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
}

export default function ImportarProprietariosPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError("");
    setResult(null);

    if (file.name.endsWith(".json")) {
      parseJSON(file);
    } else if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      parseCSV(file);
    } else {
      setParseError("Formato nao suportado. Use .json ou .csv");
    }
  }

  function parseJSON(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const arr = Array.isArray(data) ? data : data.data || data.proprietarios || [];
        if (!Array.isArray(arr) || arr.length === 0) {
          setParseError("Arquivo JSON vazio ou formato invalido");
          return;
        }
        setRows(arr);
      } catch {
        setParseError("Erro ao ler JSON. Verifique o formato.");
      }
    };
    reader.readAsText(file);
  }

  function parseCSV(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim());
        if (lines.length < 2) {
          setParseError("CSV deve ter cabeçalho + pelo menos 1 linha de dados");
          return;
        }

        const separator = lines[0].includes(";") ? ";" : ",";
        const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

        // Mapear colunas conhecidas
        const colMap: Record<string, string> = {};
        const knownFields = ["nome", "cpfcnpj", "cpf_cnpj", "cpf", "cnpj", "email", "telefone", "fone", "endereco", "cidade", "uf", "estado", "observacoes"];
        const fieldMap: Record<string, string> = {
          cpfcnpj: "cpfCnpj", cpf_cnpj: "cpfCnpj", cpf: "cpfCnpj", cnpj: "cpfCnpj",
          fone: "telefone", estado: "uf",
        };

        headers.forEach((h, i) => {
          const normalized = h.replace(/\s+/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (knownFields.includes(normalized)) {
            colMap[String(i)] = fieldMap[normalized] || normalized;
          }
        });

        if (!Object.values(colMap).includes("nome")) {
          setParseError("CSV deve ter uma coluna 'nome'");
          return;
        }

        const parsed: ImportRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(separator).map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
          const row: Record<string, string> = {};
          Object.entries(colMap).forEach(([idx, field]) => {
            if (cols[parseInt(idx)]) row[field] = cols[parseInt(idx)];
          });
          if (row.nome) parsed.push(row as unknown as ImportRow);
        }

        setRows(parsed);
      } catch {
        setParseError("Erro ao ler CSV");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/brasil-solar/proprietarios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: rows }),
      });

      const data = await res.json();
      setResult(data);

      if (res.ok) {
        toast.success(`Importacao concluida: ${data.created} criados, ${data.updated} atualizados`);
      } else {
        toast.error(data.error || "Erro na importacao");
      }
    } catch {
      toast.error("Falha na conexao");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/brasil-solar/proprietarios" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Importar Proprietarios</h1>
          <p className="text-sm text-muted-foreground">Importacao em lote via CSV ou JSON</p>
        </div>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">1. Selecionar Arquivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 p-8 border-2 border-dashed rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo .csv ou .json</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.json,.txt" onChange={handleFileChange} className="hidden" />

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {parseError}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>CSV:</strong> colunas: nome, cpfCnpj (ou cpf_cnpj), email, telefone, endereco, cidade, uf</p>
              <p><strong>JSON:</strong> array de objetos ou {"{"} data: [...] {"}"} com os mesmos campos</p>
              <p>Se o CPF/CNPJ ja existir, o registro sera atualizado em vez de duplicado.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              2. Preview ({rows.length} registros)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">#</th>
                    <th className="text-left py-2 px-3 font-medium">Nome</th>
                    <th className="text-left py-2 px-3 font-medium">CPF/CNPJ</th>
                    <th className="text-left py-2 px-3 font-medium">Email</th>
                    <th className="text-left py-2 px-3 font-medium">Telefone</th>
                    <th className="text-left py-2 px-3 font-medium">Cidade</th>
                    <th className="text-left py-2 px-3 font-medium">UF</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1.5 px-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 px-3 font-medium">{row.nome || "-"}</td>
                      <td className="py-1.5 px-3 font-mono">{row.cpfCnpj || "-"}</td>
                      <td className="py-1.5 px-3">{row.email || "-"}</td>
                      <td className="py-1.5 px-3">{row.telefone || "-"}</td>
                      <td className="py-1.5 px-3">{row.cidade || "-"}</td>
                      <td className="py-1.5 px-3">{row.uf || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ...e mais {rows.length - 50} registros
                </p>
              )}
            </div>

            <div className="p-3 border-t">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar {rows.length} registros
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" />
              3. Resultado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold">{result.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-lg">
                <p className="text-lg font-bold text-emerald-600">{result.created}</p>
                <p className="text-xs text-muted-foreground">Criados</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-lg font-bold text-blue-600">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-lg font-bold text-amber-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">Ignorados</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-600">{result.errors}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
            </div>

            {result.errorDetails.length > 0 && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg text-xs text-red-700 space-y-1">
                {result.errorDetails.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
