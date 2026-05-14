"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileText,
  Check,
  AlertTriangle,
  UserPlus,
  X,
  Search,
  ChevronDown,
} from "lucide-react";
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
  potenciaInstalada?: string;
  plataformaMonitoramento?: string;
  inversorMarca?: string;
  concessionaria?: string;
  codigoUc?: string;
  statusContrato?: string;
  consultor?: string;
  geracaoMediaEsperada?: string;
  observacoesInternas?: string;
  proprietarioId?: string;
  // outros campos opcionais
  [key: string]: string | undefined;
}

interface Proprietario {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
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

// Mapeamento de nomes de colunas CSV -> campo do sistema
const COLUMN_MAP: Record<string, string> = {
  nome: "nome",
  "nome do cliente": "nome",
  cliente: "nome",
  "nome da usina": "nome",
  usina: "nome",
  cpfcnpj: "cpfCnpj",
  cpf_cnpj: "cpfCnpj",
  "cpf/cnpj": "cpfCnpj",
  cpf: "cpfCnpj",
  cnpj: "cpfCnpj",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  fone: "telefone",
  celular: "telefone",
  endereco: "endereco",
  "endereço": "endereco",
  cidade: "cidade",
  uf: "uf",
  estado: "uf",
  potencia: "potenciaInstalada",
  "potencia instalada": "potenciaInstalada",
  "potência instalada": "potenciaInstalada",
  kwp: "potenciaInstalada",
  plataforma: "plataformaMonitoramento",
  "plataforma monitoramento": "plataformaMonitoramento",
  inversor: "inversorMarca",
  "inversor marca": "inversorMarca",
  concessionaria: "concessionaria",
  "concessionária": "concessionaria",
  distribuidora: "concessionaria",
  "codigo uc": "codigoUc",
  "código uc": "codigoUc",
  uc: "codigoUc",
  "status contrato": "statusContrato",
  status: "statusContrato",
  consultor: "consultor",
  "geracao media": "geracaoMediaEsperada",
  "geração média": "geracaoMediaEsperada",
  "geracao media esperada": "geracaoMediaEsperada",
  investimento: "investimento",
  "investimento r$": "investimento",
  "valor investimento": "investimento",
  observacoes: "observacoesInternas",
  "observações": "observacoesInternas",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "");
}

function mapHeader(h: string): string | null {
  const norm = normalizeHeader(h);
  return COLUMN_MAP[norm] || null;
}

// Mini componente de seletor de proprietario inline
function ProprietarioInlineSelect({
  value,
  onChange,
  proprietarios,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  proprietarios: Proprietario[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = value ? proprietarios.find((p) => p.id === value) : null;
  const filtered = search
    ? proprietarios.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) ||
          (p.cpfCnpj && p.cpfCnpj.includes(search))
      )
    : proprietarios;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted/50 transition-colors max-w-[200px] truncate"
      >
        {selected ? (
          <>
            <span className="truncate">{selected.nome}</span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="shrink-0 p-0.5 hover:bg-muted rounded"
            >
              <X className="h-3 w-3" />
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Vincular...</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-background border rounded-lg shadow-lg right-0">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-center text-muted-foreground">
                Nenhum encontrado
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors ${
                    value === p.id ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <span className="font-medium">{p.nome}</span>
                  {p.cpfCnpj && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      {p.cpfCnpj}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportarClientesBrasilSolarPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState("");
  const [proprietarios, setProprietarios] = useState<Proprietario[]>([]);
  const [globalProprietarioId, setGlobalProprietarioId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carregar proprietarios
  useEffect(() => {
    fetch("/api/brasil-solar/proprietarios?all=true")
      .then((res) => res.json())
      .then((data) => setProprietarios(data.proprietarios || []))
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError("");
    setResult(null);
    setRows([]);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "json") {
      parseJSON(file);
    } else if (ext === "csv" || ext === "txt") {
      parseCSV(file);
    } else {
      setParseError(
        "Formato nao suportado. Use .csv ou .json"
      );
    }
  }

  function parseJSON(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const arr = Array.isArray(data)
          ? data
          : data.data || data.clientes || data.clients || [];
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
          setParseError("CSV deve ter cabecalho + pelo menos 1 linha de dados");
          return;
        }

        const separator = lines[0].includes(";") ? ";" : ",";
        const headers = lines[0].split(separator).map((h) => h.trim().replace(/^['"]|['"]$/g, ""));

        // Mapear colunas
        const colMap: Record<number, string> = {};
        headers.forEach((h, i) => {
          const mapped = mapHeader(h);
          if (mapped) colMap[i] = mapped;
        });

        if (!Object.values(colMap).includes("nome")) {
          setParseError(
            "CSV deve ter uma coluna 'Nome' (ou 'Nome do Cliente', 'Cliente', 'Nome da Usina')"
          );
          return;
        }

        const parsed: ImportRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i]
            .split(separator)
            .map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
          const row: Record<string, string> = {};
          Object.entries(colMap).forEach(([idx, field]) => {
            const val = cols[parseInt(idx)];
            if (val) row[field] = val;
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

  // Aplicar proprietario global a todos
  const applyGlobalProprietario = useCallback(() => {
    if (!globalProprietarioId) return;
    setRows((prev) =>
      prev.map((r) => ({ ...r, proprietarioId: globalProprietarioId }))
    );
    toast.success("Proprietario aplicado a todos os registros");
  }, [globalProprietarioId]);

  function setRowProprietario(index: number, proprietarioId: string | null) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, proprietarioId: proprietarioId || undefined } : r
      )
    );
  }

  async function handleImport() {
    if (rows.length === 0) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/brasil-solar/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: rows }),
      });

      const data = await res.json();
      setResult(data);

      if (res.ok) {
        toast.success(
          `Importacao concluida: ${data.created} criados, ${data.updated} atualizados`
        );
      } else {
        toast.error(data.error || "Erro na importacao");
      }
    } catch {
      toast.error("Falha na conexao");
    } finally {
      setImporting(false);
    }
  }

  const getProprietarioNome = (id?: string) => {
    if (!id) return null;
    return proprietarios.find((p) => p.id === id)?.nome || null;
  };

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/brasil-solar"
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Importar Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Importacao em lote de plantas/usinas via CSV ou JSON
          </p>
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
              <p className="text-sm text-muted-foreground">
                Clique para selecionar um arquivo .csv ou .json
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            {parseError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {parseError}
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong>CSV:</strong> colunas reconhecidas: Nome, CPF/CNPJ,
                Email, Telefone, Endereco, Cidade, UF, Potencia Instalada,
                Plataforma, Inversor, Concessionaria, Codigo UC, Status, Consultor,
                Geracao Media, Observacoes
              </p>
              <p>
                <strong>JSON:</strong> array de objetos ou {"{"} data: [...] {"}"}{" "}
                com os mesmos campos
              </p>
              <p>
                Se o CPF/CNPJ ja existir no sistema, o registro sera atualizado
                em vez de duplicado.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Proprietario global */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              2. Vincular Proprietario (Dono da Usina)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Voce pode vincular um proprietario a todos os registros de uma vez,
              ou vincular individualmente na tabela abaixo. Um mesmo proprietario
              pode ter varias usinas.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-sm">
                <label className="text-xs font-medium text-muted-foreground">
                  Proprietario para todos
                </label>
                <div className="mt-1 relative" >
                  <GlobalProprietarioSelect
                    value={globalProprietarioId}
                    onChange={setGlobalProprietarioId}
                    proprietarios={proprietarios}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={applyGlobalProprietario}
                disabled={!globalProprietarioId}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Aplicar a Todos
              </button>
              <Link
                href="/admin/brasil-solar/proprietarios/novo"
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
              >
                Novo Proprietario
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              3. Preview ({rows.length} registros)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3 font-medium">#</th>
                    <th className="text-left py-2 px-3 font-medium">Nome</th>
                    <th className="text-left py-2 px-3 font-medium">CPF/CNPJ</th>
                    <th className="text-left py-2 px-3 font-medium">Cidade/UF</th>
                    <th className="text-left py-2 px-3 font-medium">kWp</th>
                    <th className="text-left py-2 px-3 font-medium">Plataforma</th>
                    <th className="text-left py-2 px-3 font-medium">Concessionaria</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">Proprietario</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 px-3 text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="py-1.5 px-3 font-medium">
                        {row.nome || "-"}
                      </td>
                      <td className="py-1.5 px-3 font-mono">
                        {row.cpfCnpj || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {[row.cidade, row.uf].filter(Boolean).join("/") || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {row.potenciaInstalada || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {row.plataformaMonitoramento || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {row.concessionaria || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {row.statusContrato || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {proprietarios.length > 0 ? (
                          <ProprietarioInlineSelect
                            value={row.proprietarioId || null}
                            onChange={(id) => setRowProprietario(i, id)}
                            proprietarios={proprietarios}
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            {getProprietarioNome(row.proprietarioId) || "-"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ...e mais {rows.length - 200} registros (todos serao
                  importados)
                </p>
              )}
            </div>

            <div className="p-3 border-t flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Importar {rows.length} registros
              </button>
              {rows.some((r) => r.proprietarioId) && (
                <span className="text-xs text-muted-foreground">
                  {rows.filter((r) => r.proprietarioId).length} de {rows.length}{" "}
                  com proprietario vinculado
                </span>
              )}
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
              4. Resultado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold">{result.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-3 bg-emerald-50 rounded-lg">
                <p className="text-lg font-bold text-emerald-600">
                  {result.created}
                </p>
                <p className="text-xs text-muted-foreground">Criados</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-lg font-bold text-blue-600">
                  {result.updated}
                </p>
                <p className="text-xs text-muted-foreground">Atualizados</p>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <p className="text-lg font-bold text-amber-600">
                  {result.skipped}
                </p>
                <p className="text-xs text-muted-foreground">Ignorados</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-600">
                  {result.errors}
                </p>
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

// Seletor global de proprietario (maior, com busca)
function GlobalProprietarioSelect({
  value,
  onChange,
  proprietarios,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  proprietarios: Proprietario[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = value ? proprietarios.find((p) => p.id === value) : null;
  const filtered = search
    ? proprietarios.filter(
        (p) =>
          p.nome.toLowerCase().includes(search.toLowerCase()) ||
          (p.cpfCnpj && p.cpfCnpj.includes(search))
      )
    : proprietarios;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center justify-between w-full px-3 py-2 text-sm border rounded-lg bg-background hover:bg-muted/50 transition-colors text-left"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? (
            <span>
              {selected.nome}
              {selected.cpfCnpj && (
                <span className="text-xs text-muted-foreground ml-1.5">
                  ({selected.cpfCnpj})
                </span>
              )}
            </span>
          ) : (
            "Selecionar proprietario..."
          )}
        </span>
        <span className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-0.5 hover:bg-muted rounded"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border rounded-lg shadow-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar por nome ou CPF/CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                Nenhum proprietario encontrado
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                    value === p.id ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <span className="font-medium">{p.nome}</span>
                  {p.cpfCnpj && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {p.cpfCnpj}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
