"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, FileUp, Trash2, Eye, Lock } from "lucide-react";

interface Props {
  label: string;
  description?: string;
  currentUrl: string | null;
  uploadedAt?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onUpload: (file: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  accept?: string;
}

export function UploadSlot({
  label,
  description,
  currentUrl,
  uploadedAt,
  disabled,
  disabledReason,
  onUpload,
  onDelete,
  accept = ".pdf,.png,.jpg,.jpeg,.webp",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm(`Remover ${label}?`)) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  const filled = !!currentUrl;
  const fileHref = currentUrl ? `/api/files/${currentUrl.replace(/^uploads\//, "")}` : null;

  return (
    <div
      className={`rounded-lg border p-4 transition ${
        disabled
          ? "border-dashed border-slate-200 bg-slate-50/60"
          : filled
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-dashed border-slate-300 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {filled ? (
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : disabled ? (
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <FileUp className="h-4 w-4 text-slate-500 shrink-0" />
            )}
            <p className="font-medium text-sm">{label}</p>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          {uploadedAt && filled && (
            <p className="text-xs text-emerald-700 mt-1">
              Enviado em {new Date(uploadedAt).toLocaleString("pt-BR")}
            </p>
          )}
          {disabled && disabledReason && (
            <p className="text-xs text-slate-500 mt-1">{disabledReason}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {filled && fileHref && (
          <a href={fileHref} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="outline" size="sm">
              <Eye className="h-4 w-4 mr-1" />
              Ver
            </Button>
          </a>
        )}
        <Button
          type="button"
          variant={filled ? "outline" : "default"}
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={filled ? "" : "bg-green-700 hover:bg-green-800"}
        >
          <FileUp className="h-4 w-4 mr-1" />
          {busy ? "Enviando..." : filled ? "Substituir" : "Enviar"}
        </Button>
        {filled && onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
