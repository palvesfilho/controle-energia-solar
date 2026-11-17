"use client";

/**
 * Arquivos do investidor: contrato, CNH/RG, comprovante, outros. Vários por
 * investidor, cada um com tipo e descrição opcional.
 *
 * Dois modos:
 *  - `investorId` presente (investidor já salvo): envia na hora e lista do banco.
 *  - sem `investorId` (tela "Novo Investidor"): os arquivos ficam na lista
 *    `pendentes`, e a tela os envia com `enviarArquivosInvestidor` depois de
 *    criar o cadastro — antes disso não há investidor para pendurá-los.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EXTENSOES_ARQUIVO_INVESTIDOR,
  TAMANHO_MAXIMO_ARQUIVO_INVESTIDOR,
  TIPOS_ARQUIVO_INVESTIDOR,
  rotuloTipoArquivoInvestidor,
  type TipoArquivoInvestidor,
} from "@/lib/investidor-arquivos";
import { hrefDoArquivo } from "@/lib/documentos-adesao";

export interface ArquivoPendente {
  chave: string;
  arquivo: File;
  tipo: TipoArquivoInvestidor;
  descricao: string;
}

interface ArquivoSalvo {
  id: string;
  tipo: string;
  descricao: string | null;
  url: string;
  fileName: string;
  size: number | null;
  createdAt: string;
}

function formatarTamanho(b: number | null | undefined): string {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function enviarUm(investorId: string, p: Omit<ArquivoPendente, "chave">) {
  const form = new FormData();
  form.append("arquivo", p.arquivo);
  form.append("tipo", p.tipo);
  if (p.descricao.trim()) form.append("descricao", p.descricao.trim());
  const res = await fetch(`/api/investors/${investorId}/arquivos`, { method: "POST", body: form });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
}

/** Envia os arquivos guardados na tela de cadastro. Devolve os que falharam. */
export async function enviarArquivosInvestidor(
  investorId: string,
  pendentes: ArquivoPendente[],
): Promise<{ enviados: number; falhas: string[] }> {
  let enviados = 0;
  const falhas: string[] = [];
  for (const p of pendentes) {
    try {
      await enviarUm(investorId, p);
      enviados++;
    } catch (e) {
      falhas.push(`${p.arquivo.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { enviados, falhas };
}

export function InvestidorArquivos({
  investorId,
  pendentes,
  onPendentesChange,
}: {
  investorId?: string;
  pendentes?: ArquivoPendente[];
  onPendentesChange?: (lista: ArquivoPendente[]) => void;
}) {
  const [salvos, setSalvos] = useState<ArquivoSalvo[]>([]);
  const [carregando, setCarregando] = useState(!!investorId);
  const [enviando, setEnviando] = useState(false);
  const [tipo, setTipo] = useState<TipoArquivoInvestidor>("CONTRATO");
  const [descricao, setDescricao] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!investorId) return;
    try {
      const res = await fetch(`/api/investors/${investorId}/arquivos`, { cache: "no-store" });
      const dados = await res.json().catch(() => []);
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      setSalvos(dados);
    } catch (e) {
      toast.error(`Não consegui carregar os arquivos: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCarregando(false);
    }
  }, [investorId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function escolhidos(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length === 0) return;
    const grandes = arquivos.filter((a) => a.size > TAMANHO_MAXIMO_ARQUIVO_INVESTIDOR);
    if (grandes.length) {
      toast.error(`Maior que 20 MB: ${grandes.map((a) => a.name).join(", ")}`);
      return;
    }

    if (!investorId) {
      onPendentesChange?.([
        ...(pendentes ?? []),
        ...arquivos.map((arquivo) => ({
          chave: `${arquivo.name}-${arquivo.size}-${Math.random()}`,
          arquivo,
          tipo,
          descricao,
        })),
      ]);
      setDescricao("");
      return;
    }

    setEnviando(true);
    const r = await enviarArquivosInvestidor(
      investorId,
      arquivos.map((arquivo) => ({ chave: "", arquivo, tipo, descricao })),
    );
    setEnviando(false);
    if (r.enviados) toast.success(`${r.enviados} arquivo(s) anexado(s).`);
    if (r.falhas.length) toast.error(`Não anexados: ${r.falhas.join(" · ")}`);
    setDescricao("");
    await carregar();
  }

  async function remover(a: ArquivoSalvo) {
    if (!confirm(`Remover "${a.fileName}"? O arquivo será apagado.`)) return;
    const res = await fetch(`/api/investors/${investorId}/arquivos/${a.id}`, { method: "DELETE" });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(`Falha ao remover: ${dados.error ?? res.status}`);
      return;
    }
    toast.success("Arquivo removido.");
    await carregar();
  }

  const linhas = investorId
    ? salvos.map((a) => ({
        chave: a.id,
        tipo: a.tipo,
        descricao: a.descricao,
        nome: a.fileName,
        tamanho: a.size,
        href: hrefDoArquivo(a.url),
        data: new Date(a.createdAt).toLocaleDateString("pt-BR"),
        remover: () => void remover(a),
      }))
    : (pendentes ?? []).map((p) => ({
        chave: p.chave,
        tipo: p.tipo,
        descricao: p.descricao || null,
        nome: p.arquivo.name,
        tamanho: p.arquivo.size,
        href: null as string | null,
        data: "ao salvar",
        remover: () => onPendentesChange?.((pendentes ?? []).filter((x) => x.chave !== p.chave)),
      }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          Arquivos do investidor
          <Badge variant="outline">{linhas.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Contrato, CNH/RG, comprovantes e outros. PDF, JPG, PNG ou Word, até 20 MB cada.
          {!investorId && " Os arquivos são enviados quando o investidor for salvo."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoArquivoInvestidor)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {TIPOS_ARQUIVO_INVESTIDOR.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Descrição (opcional)
            </label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={200}
              placeholder="Ex.: contrato de arrendamento 2026, aditivo..."
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept={EXTENSOES_ARQUIVO_INVESTIDOR.join(",")}
            className="hidden"
            onChange={(e) => {
              const lista = e.target.files;
              void escolhidos(lista).finally(() => {
                e.target.value = "";
              });
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={enviando}
            onClick={() => input.current?.click()}
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Anexar arquivo
          </Button>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : linhas.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Nenhum arquivo anexado.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {linhas.map((l) => (
              <div key={l.chave} className="flex items-center gap-2.5 rounded-md border p-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Badge variant="secondary">{rotuloTipoArquivoInvestidor(l.tipo)}</Badge>
                    <span className="truncate" title={l.nome}>
                      {l.nome}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[l.descricao, formatarTamanho(l.tamanho), l.data].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {l.href && (
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <Button type="button" size="sm" variant="ghost" title="Remover" onClick={l.remover}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
