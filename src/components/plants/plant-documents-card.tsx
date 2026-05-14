"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  Download,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DocType = "CNH_RG" | "PROCURACAO" | "CONTRATO_SOCIAL" | "CARTAO_CNPJ";

interface PlantDocument {
  id: string;
  type: DocType;
  url: string;
  fileName: string;
  size: number | null;
  createdAt: string;
}

const DOC_TYPES: { type: DocType; label: string; description: string }[] = [
  {
    type: "CNH_RG",
    label: "CNH / RG",
    description: "Documento de identidade do responsável legal.",
  },
  {
    type: "PROCURACAO",
    label: "Procuração",
    description: "Procuração outorgando poderes de representação.",
  },
  {
    type: "CONTRATO_SOCIAL",
    label: "Contrato Social",
    description: "Contrato social ou alteração contratual da PJ.",
  },
  {
    type: "CARTAO_CNPJ",
    label: "Cartão CNPJ",
    description: "Cartão CNPJ atualizado da Receita Federal.",
  },
];

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fileHref(relativePath: string): string {
  const stripped = relativePath.replace(/^uploads\//, "");
  return `/api/files/${stripped}`;
}

export function PlantDocumentsCard({
  plantId,
  embedded,
}: {
  plantId: string;
  embedded?: boolean;
}) {
  const [docs, setDocs] = useState<PlantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<DocType | null>(null);
  const inputRefs = useRef<Record<DocType, HTMLInputElement | null>>({
    CNH_RG: null,
    PROCURACAO: null,
    CONTRATO_SOCIAL: null,
    CARTAO_CNPJ: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plants/${plantId}/documents`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao carregar documentos");
      }
      const data: PlantDocument[] = await res.json();
      setDocs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [plantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(type: DocType, file: File) {
    setUploadingType(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", type);
      const res = await fetch(`/api/plants/${plantId}/documents`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha no upload");
      toast.success("Documento enviado");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploadingType(null);
    }
  }

  async function remove(doc: PlantDocument) {
    if (!confirm(`Remover o documento "${doc.fileName}"?`)) return;
    try {
      const res = await fetch(`/api/plants/${plantId}/documents/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao remover");
      }
      toast.success("Documento removido");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  const docsByType = new Map<DocType, PlantDocument>();
  for (const d of docs) docsByType.set(d.type, d);

  const body = loading ? (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
    </div>
  ) : (
    <div className="grid gap-3 md:grid-cols-2">
            {DOC_TYPES.map(({ type, label, description }) => {
              const doc = docsByType.get(type);
              const isUploading = uploadingType === type;
              return (
                <div
                  key={type}
                  className="rounded-lg border bg-card p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {doc && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        )}
                        {label}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  </div>

                  {doc ? (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
                      <a
                        href={fileHref(doc.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 min-w-0 text-xs text-blue-600 hover:underline"
                        title={doc.fileName}
                      >
                        <Download className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.fileName}</span>
                      </a>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {formatBytes(doc.size)}
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                      Nenhum arquivo enviado.
                    </div>
                  )}

                  <input
                    ref={(el) => {
                      inputRefs.current[type] = el;
                    }}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(type, file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUploading}
                      onClick={() => inputRefs.current[type]?.click()}
                    >
                      {isUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {doc ? "Substituir" : "Enviar"}
                    </Button>
                    {doc && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(doc)}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          Documentos
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
