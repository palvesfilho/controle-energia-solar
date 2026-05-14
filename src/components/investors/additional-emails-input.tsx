"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface Props {
  defaultValue?: string[];
  /** Nome do hidden input que carrega o JSON serializado. */
  name?: string;
}

/**
 * Input para emails adicionais do investidor (sócios, financeiro etc.).
 * Renderiza um hidden input com JSON.stringify do array — assim o
 * `Object.fromEntries(formData)` no submit ja carrega o valor pronto pra
 * `JSON.parse` no client antes do fetch.
 *
 * Uso típico:
 *   <AdditionalEmailsInput defaultValue={existing} />
 *   ...no submit:
 *   const data = Object.fromEntries(formData);
 *   data.additionalEmails = JSON.parse(data.additionalEmails as string);
 */
export function AdditionalEmailsInput({ defaultValue = [], name = "additionalEmails" }: Props) {
  const [emails, setEmails] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function tryAdd() {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Email inválido");
      return;
    }
    if (emails.includes(v)) {
      setError("Email já adicionado");
      return;
    }
    setEmails([...emails, v]);
    setDraft("");
    setError(null);
  }

  function remove(i: number) {
    setEmails(emails.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        Emails adicionais
      </label>
      <p className="text-xs text-muted-foreground -mt-1">
        Sócios, financeiro, secretária — qualquer endereço que deva receber
        avisos junto com o email principal.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              tryAdd();
            }
          }}
          placeholder="email@exemplo.com"
          className="flex-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />
        <button
          type="button"
          onClick={tryAdd}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {emails.length > 0 && (
        <ul className="space-y-1">
          {emails.map((e, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-1.5 text-sm"
            >
              <span className="truncate">{e}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remover email"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input type="hidden" name={name} value={JSON.stringify(emails)} />
    </div>
  );
}
