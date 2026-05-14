"use client";

import { useEffect, useState } from "react";
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

interface Bill {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  valorTotal: number | null;
  consumoKwh: number | null;
  energiaInjetada: number | null;
  energiaCompensada: number | null;
  saldoCreditos: number | null;
  bandeiraTarifaria: string | null;
  fonteConsulta: string | null;
  vencimento: string | null;
  contaPaga: boolean;
  pdfUrl: string | null;
  plant: { id: string; name: string } | null;
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

interface UcBillsProps {
  consumerUnitId: string;
  refreshKey?: number;
}

export function UcBills({ consumerUnitId, refreshKey }: UcBillsProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalRefresh, setInternalRefresh] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/consumer-units/${consumerUnitId}/bills`)
      .then((res) => res.json())
      .then((data) => {
        setBills(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [consumerUnitId, refreshKey, internalRefresh]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Carregando faturas...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-700" />
            <CardTitle className="text-base">
              Faturas ({bills.length})
            </CardTitle>
          </div>
          <UploadFaturasButton
            variant="outline"
            onUploadComplete={() => setInternalRefresh((k) => k + 1)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {bills.length === 0 ? (
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
                  <TableHead className="text-right">Injetada</TableHead>
                  <TableHead className="text-right">Compensada</TableHead>
                  <TableHead className="text-right">Saldo Créditos</TableHead>
                  <TableHead>Bandeira</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
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
                      {formatKwh(bill.energiaInjetada)}
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
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
