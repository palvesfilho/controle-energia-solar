"use client";

/**
 * Cadastro dos documentos da ASSOCIAÇÃO que acompanham todo rateio registrado
 * na RGE: CNH do representante, cartão CNPJ e constituição.
 *
 * Nasceram dentro da janela do ZIP do rateio, mas ninguém procura "os
 * documentos da associação" abrindo um rateio. Aqui é o endereço deles; a
 * janela do ZIP continua aceitando o envio rápido, pela mesma rota.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  ExternalLink,
  FolderLock,
  Loader2,
  Upload,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocFixo {
  chave: string;
  rotulo: string;
  nome: string | null;
  enviadoEm: string | null;
  href: string | null;
}

const API = "/api/rateios/documentos-fixos";

export default function DocumentosAssociacaoPage() {
  const [docs, setDocs] = useState<DocFixo[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const chaveEscolhida = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(API);
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      setDocs(dados as DocFixo[]);
    } catch (err) {
      toast.error(`Erro ao carregar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function enviar(arquivo: File) {
    const chave = chaveEscolhida.current;
    if (!chave) return;
    setEnviando(chave);
    try {
      const form = new FormData();
      form.append("chave", chave);
      form.append("arquivo", arquivo);
      const res = await fetch(API, { method: "POST", body: form });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(dados.error ?? `HTTP ${res.status}`);
      toast.success("Documento guardado.");
      await carregar();
    } catch (err) {
      toast.error(`Falha ao enviar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEnviando(null);
    }
  }

  const faltando = docs.filter((d) => !d.href).length;

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <Link
        href="/admin/personalizacoes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Personalizações
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white">
          <FolderLock className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Documentos da associação</h1>
          <p className="text-sm text-muted-foreground">
            Enviados uma vez, entram sozinhos no pacote de documentos que a RGE pede em todo
            rateio. Troque aqui quando um deles mudar — a CNH renovada, a constituição alterada.
          </p>
        </div>
      </div>

      <input
        ref={inputArquivo}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void enviar(f);
        }}
      />

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Carregando…
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {docs.map((d) => (
            <Card key={d.chave}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                {d.href ? (
                  <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleX className="h-5 w-5 shrink-0 text-red-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{d.rotulo}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.href
                      ? `${d.nome ?? "arquivo"}${
                          d.enviadoEm
                            ? ` · enviado em ${new Date(d.enviadoEm).toLocaleDateString("pt-BR")}`
                            : ""
                        }`
                      : "Ainda não enviado — o ZIP do rateio sai sem ele."}
                  </div>
                </div>
                {d.href && (
                  <a
                    href={d.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Abrir
                  </a>
                )}
                <Button
                  size="sm"
                  variant={d.href ? "outline" : "default"}
                  disabled={enviando !== null}
                  onClick={() => {
                    chaveEscolhida.current = d.chave;
                    inputArquivo.current?.click();
                  }}
                >
                  {enviando === d.chave ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  {d.href ? "Trocar" : "Enviar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-muted-foreground">
          {faltando === 0
            ? "Os três estão guardados."
            : `${faltando === 1 ? "Falta 1 documento" : `Faltam ${faltando} documentos`}.`}{" "}
          Formatos aceitos: PDF, JPG ou PNG, até 20 MB. Foto vira página de PDF na hora de
          montar o pacote.
        </p>
      )}
    </div>
  );
}
