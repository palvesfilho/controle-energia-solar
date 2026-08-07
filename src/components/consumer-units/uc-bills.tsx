"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText } from "lucide-react";
import { UploadFaturasButton } from "@/components/billing/upload-faturas-button";
import { formatCodigoUc } from "@/lib/uc-codigo";

interface Bill {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  valorTotal: number | null;
  consumoKwh: number | null;
  energiaInjetada: number | null;
  energiaInjetadaMedidorKwh: number | null;
  energiaCompensada: number | null;
  saldoCreditos: number | null;
  bandeiraTarifaria: string | null;
  fonteConsulta: string | null;
  vencimento: string | null;
  contaPaga: boolean;
  pdfUrl: string | null;
  plant: { id: string; name: string } | null;
}

/** Um bloco da tabela: as faturas de uma UC. */
interface Grupo {
  consumerUnitId: string;
  codigoUc: string;
  nome: string;
  tipo: "TITULAR" | "BENEFICIARIA";
  percentual: number | null;
  bills: Bill[];
}

const MESES = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatCurrency(value: number | null): string {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatKwh(value: number | null): string {
  if (value == null) return "-";
  return `${value.toLocaleString("pt-BR")} kWh`;
}

/**
 * `consumerUnitId` = uma UC só (tela de edição da UC).
 * `proprietarioId` = TODAS as UCs do proprietário, agrupadas — titular primeiro,
 * beneficiárias depois. Sem isso, um backfill que baixa faturas de beneficiária
 * grava tudo certo no banco e não aparece em lugar nenhum da tela, o que parece
 * falha de download (caso CASA ANDRÉ, 07/08/2026).
 */
type UcBillsProps =
  | { consumerUnitId: string; proprietarioId?: never; refreshKey?: number }
  | { proprietarioId: string; consumerUnitId?: never; refreshKey?: number };

export function UcBills(props: UcBillsProps) {
  const { consumerUnitId, proprietarioId, refreshKey } = props;
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalRefresh, setInternalRefresh] = useState(0);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      if (proprietarioId) {
        const res = await fetch(
          `/api/brasil-solar/proprietarios/${proprietarioId}/bills`,
        );
        const data = await res.json();
        setGrupos(Array.isArray(data?.grupos) ? data.grupos : []);
      } else {
        const res = await fetch(`/api/consumer-units/${consumerUnitId}/bills`);
        const data = await res.json();
        setGrupos([
          {
            consumerUnitId: consumerUnitId!,
            codigoUc: "",
            nome: "",
            tipo: "TITULAR",
            percentual: null,
            bills: Array.isArray(data) ? data : [],
          },
        ]);
      }
    } catch {
      setGrupos([]);
    } finally {
      setLoading(false);
    }
  }, [consumerUnitId, proprietarioId]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshKey, internalRefresh]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Carregando faturas...
        </CardContent>
      </Card>
    );
  }

  const total = grupos.reduce((n, g) => n + g.bills.length, 0);
  // Só vale mostrar cabeçalho de UC quando há mais de uma: na tela da UC
  // avulsa a tabela continua exatamente como era.
  const agrupar = !!proprietarioId && grupos.length > 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-700" />
            <CardTitle className="text-base">Faturas ({total})</CardTitle>
          </div>
          <UploadFaturasButton
            variant="outline"
            onUploadComplete={() => setInternalRefresh((k) => k + 1)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 && !agrupar ? (
          <p className="text-center text-muted-foreground py-4">
            Nenhuma fatura sincronizada. Cadastre as credenciais e clique em &quot;Sincronizar Faturas&quot;.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right" title="Consumo registrado da rede (sem o autoconsumo instantâneo da geração própria)">Consumo da Rede</TableHead>
                  <TableHead className="text-right" title="Energia injetada na rede, lida pelo medidor de geração">Injetada</TableHead>
                  <TableHead className="text-right" title="Energia compensada na fatura (créditos GD que abateram o consumo)">Compensada</TableHead>
                  <TableHead className="text-right">Saldo Créditos</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <UcGrupo key={g.consumerUnitId} grupo={g} agrupar={agrupar} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UcGrupo({ grupo, agrupar }: { grupo: Grupo; agrupar: boolean }) {
  return (
    <>
      {agrupar && (
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableCell colSpan={9} className="py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{grupo.nome}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatCodigoUc(grupo.codigoUc)}
              </span>
              {grupo.tipo === "TITULAR" ? (
                <Badge variant="secondary" className="text-xs">Titular</Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Beneficiária
                  {grupo.percentual != null &&
                    ` · ${grupo.percentual.toLocaleString("pt-BR")}%`}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {grupo.bills.length} fatura(s)
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* UC sem fatura nenhuma continua visível: "vazia" é informação — é o que
          diz que o download não trouxe nada para ELA, em vez de a UC sumir. */}
      {agrupar && grupo.bills.length === 0 && (
        <TableRow>
          <TableCell colSpan={9} className="text-sm text-muted-foreground py-3">
            Nenhuma fatura sincronizada para esta UC.
          </TableCell>
        </TableRow>
      )}

      {grupo.bills.map((bill) => (
        <TableRow key={bill.id}>
          <TableCell className="font-medium">
            {MESES[bill.mesReferencia]}/{bill.anoReferencia}
          </TableCell>
          <TableCell className="text-right">
            {formatCurrency(bill.valorTotal)}
          </TableCell>
          <TableCell className="text-right">
            {formatKwh(bill.consumoKwh)}
          </TableCell>
          <TableCell className="text-right text-green-600">
            {formatKwh(bill.energiaInjetadaMedidorKwh)}
          </TableCell>
          <TableCell className="text-right text-blue-600">
            {formatKwh(bill.energiaCompensada)}
          </TableCell>
          <TableCell className="text-right font-semibold">
            {formatKwh(bill.saldoCreditos)}
          </TableCell>
          <TableCell>
            {bill.bandeiraTarifaria ? (
              <Badge
                variant="secondary"
                className={
                  bill.bandeiraTarifaria.toLowerCase().includes("verde")
                    ? "bg-green-100 text-green-700"
                    : bill.bandeiraTarifaria.toLowerCase().includes("amarela")
                      ? "bg-yellow-100 text-yellow-700"
                      : bill.bandeiraTarifaria.toLowerCase().includes("vermelha")
                        ? "bg-red-100 text-red-700"
                        : ""
                }
              >
                {bill.bandeiraTarifaria}
              </Badge>
            ) : (
              "-"
            )}
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-xs">
              {bill.fonteConsulta || "N/A"}
            </Badge>
          </TableCell>
          <TableCell>
            {bill.pdfUrl ? (
              <a
                href={bill.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs"
              >
                Ver PDF
              </a>
            ) : (
              "-"
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
