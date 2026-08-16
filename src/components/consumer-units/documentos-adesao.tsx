"use client";

/**
 * Painel de documentos da adesão, exibido ao lado do card Identificação.
 *
 * São seis fichas fixas — uma por tipo de documento. Ficha sem arquivo aparece
 * tracejada em vez de desaparecer: a lista precisa mostrar o que FALTA, não só
 * o que veio. Um painel que esconde as ausências passa a impressão de estar
 * completo quando não está.
 *
 * Antes de a UC ser salva os arquivos ainda estão no CRM, então as fichas
 * apontam para as rotas de leitura do CRM. Depois de salva, apontam para a
 * cópia guardada na própria UC — que é o que sobrevive a uma faxina no CRM.
 * Quem monta as fichas de cada caso é a tela; ver [[documentos-adesao]].
 */

import {
  FileSignature,
  FileText,
  IdCard,
  CreditCard,
  ScrollText,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCpfCnpjComRotulo } from "@/lib/documento";
import type { FichaDocumento } from "@/lib/documentos-adesao";

export type { FichaDocumento };

const ICONE: Record<string, React.ElementType> = {
  termo: FileSignature,
  procuracao: FileText,
  identidade: IdCard,
  cartao_cnpj: CreditCard,
  contrato_social: ScrollText,
  outros: Plus,
};

export function DocumentosAdesao({
  fichas,
  adesaoIdCrm,
  copiadosEm,
  signatarioNome,
  signatarioCpf,
}: {
  fichas: FichaDocumento[];
  adesaoIdCrm?: number | null;
  copiadosEm?: string | null;
  signatarioNome?: string | null;
  signatarioCpf?: string | null;
}) {
  const preenchidas = fichas.filter((f) => f.href).length;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Documentos da adesão
          <Badge variant="outline">
            {preenchidas} de {fichas.length}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 p-3">
        {fichas.map((f) => {
          const Icone = ICONE[f.chave] ?? FileText;
          const vazia = !f.href;
          return (
            <div
              key={f.chave}
              className={cn(
                "flex items-center gap-2.5 rounded-md border p-2.5",
                vazia && "border-dashed",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  vazia
                    ? "border border-dashed text-muted-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                <Icone className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className={cn("text-sm", vazia && "text-muted-foreground")}>
                  {f.rotulo}
                </div>
                <div
                  className="truncate text-xs text-muted-foreground"
                  title={f.detalhe ?? undefined}
                >
                  {f.detalhe ?? "nada anexado"}
                </div>
              </div>

              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-7 px-2.5")}
                >
                  Ver
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        })}
      </CardContent>

      <div className="border-t px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {adesaoIdCrm == null ? (
          // Sem procedência não é o mesmo que "nada a dizer": o cadastro que
          // nunca passou pela fila do CRM não tem de onde tirar papelada, e o
          // painel precisa explicar isso em vez de exibir seis fichas mudas.
          <>
            Nenhum documento copiado do CRM. A papelada chega quando o cadastro é
            feito pela fila de <strong className="text-foreground">Vendas do CRM</strong>;
            cadastro anterior à integração não foi preenchido retroativamente.
          </>
        ) : (
          <>
            {copiadosEm ? (
              <>
                Copiados da <strong className="text-foreground">adesão {adesaoIdCrm}</strong> do
                CRM em {new Date(copiadosEm).toLocaleDateString("pt-BR")}. Ficam guardados
                aqui — se a adesão for apagada lá, o arquivo continua neste cadastro.
              </>
            ) : (
              <>
                Da <strong className="text-foreground">adesão {adesaoIdCrm}</strong> do CRM.
                Serão copiados para dentro deste cadastro ao salvar.
              </>
            )}
            {signatarioNome && (
              <>
                <br />
                Assinou: <strong className="text-foreground">{signatarioNome}</strong>
                {signatarioCpf && <> · {formatCpfCnpjComRotulo(signatarioCpf)}</>}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
