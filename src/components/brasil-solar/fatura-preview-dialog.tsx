"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText } from "lucide-react";

export interface FaturaPreviewData {
  ucNome: string;
  ucCodigo: string;
  mes: number;
  ano: number;
  valorTotal: number | null;
  energiaCompensada: number | null;
  descontoValor: number | null;
  contaPaga: boolean;
  pdfUrl: string | null;
}

function fmtBR(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mesAnoLongo(mes: number, ano: number): string {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[mes - 1]}/${ano}`;
}

export function FaturaPreviewDialog({
  open,
  onOpenChange,
  fatura,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fatura: FaturaPreviewData | null;
}) {
  if (!fatura) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[95vw] !max-w-[95vw] sm:!max-w-[95vw] !h-[92vh] !max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-700" />
            <DialogTitle className="text-base">
              {fatura.ucNome}
              <span className="text-muted-foreground font-normal text-sm ml-2">
                · {mesAnoLongo(fatura.mes, fatura.ano)}
              </span>
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            UC {fatura.ucCodigo}
          </p>
        </DialogHeader>

        <div className="px-6 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Valor total</p>
            <p className="font-semibold">
              {fatura.valorTotal != null
                ? `R$ ${fmtBR(fatura.valorTotal)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Energia compensada</p>
            <p className="font-semibold">
              {fatura.energiaCompensada != null
                ? `${fmtBR(fatura.energiaCompensada)} kWh`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Desconto / economia</p>
            <p className="font-semibold text-emerald-700">
              {fatura.descontoValor != null
                ? `R$ ${fmtBR(fatura.descontoValor)}`
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status pagamento</p>
            <div className="mt-0.5">
              {fatura.contaPaga ? (
                <Badge className="bg-green-600">Paga</Badge>
              ) : (
                <Badge variant="secondary">Em aberto</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-muted/40 overflow-hidden">
          {fatura.pdfUrl ? (
            <iframe
              src={fatura.pdfUrl}
              title={`Fatura ${fatura.ucCodigo} ${fatura.mes}/${fatura.ano}`}
              className="w-full h-full border-0"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              PDF não disponível pra essa fatura.
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t flex flex-row gap-2 justify-end">
          {fatura.pdfUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(fatura.pdfUrl!, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Abrir em nova aba
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
