"use client";

/**
 * O "+ Adicionar UC" do rateio: busca por NOME ou CÓDIGO entre todas as
 * unidades consumidoras ativas.
 *
 * Antes de 22/08/2026 não havia o que buscar — o rateio listava apenas as UCs
 * que já tinham `plantId` desta usina no cadastro (101 das 147 ativas), e as
 * outras 46 não tinham como entrar em rateio nenhum. Para incluir uma UC era
 * preciso sair da tela, editar o cadastro e voltar.
 *
 * 🚩 A lista mostra TUDO, inclusive UC já comprometida no rateio de outra
 * usina — marcada em vermelho, com o nome da usina e o percentual de lá.
 * Esconder faria a mesma UC ser rateada duas vezes sem ninguém ver; mostrar com
 * aviso deixa a decisão com quem monta o rateio.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Factory, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCodigoUc } from "@/lib/uc-codigo";

export interface UnidadeDisponivel {
  id: string;
  nome: string;
  codigoUc: string | null;
  cidade: string | null;
  distribuidora: string | null;
  /** kWh/mês do cadastro (contrato). */
  consumoMedio?: number | null;
  /**
   * kWh/mês medido: média das faturas dos últimos 12 meses.
   * A sugestão de percentuais usa o MAIOR entre este e o de contrato.
   */
  consumoReal?: number | null;
  /** Quantas faturas entraram na média do consumo real. */
  consumoRealMeses?: number;
  isGeradora?: boolean;
  /** Já vinculada a esta usina no cadastro. */
  daUsina?: boolean;
  /** A usina do cadastro, quando é outra. */
  usinaCadastro?: { id: string; name: string } | null;
  /** Rateio de outra usina que já destina crédito a ela. */
  comprometida?: {
    plantId: string;
    plantName: string;
    percentual: number;
    status: string;
  } | null;
}

/**
 * O consumo que a sugestão vai usar: o MAIOR entre contrato e real
 * (mesma regra de `@/lib/rateio-sugestao`, aqui só para o texto da lista).
 */
function consumoDaUc(u: UnidadeDisponivel): { valor: number; origem: string } | null {
  const contrato = u.consumoMedio && u.consumoMedio > 0 ? u.consumoMedio : null;
  const real = u.consumoReal && u.consumoReal > 0 ? u.consumoReal : null;
  if (contrato === null && real === null) return null;
  if (real !== null && (contrato === null || real > contrato)) {
    return { valor: real, origem: "real" };
  }
  return { valor: contrato!, origem: "contrato" };
}

/** Só dígitos, para o código casar mesmo digitado com pontuação. */
function digitos(v: string): string {
  return v.replace(/\D/g, "");
}

export function AdicionarUc({
  unidades,
  jaSelecionadas,
  onAdicionar,
}: {
  unidades: UnidadeDisponivel[];
  jaSelecionadas: Set<string>;
  onAdicionar: (u: UnidadeDisponivel) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const candidatas = useMemo(
    () => unidades.filter((u) => !jaSelecionadas.has(u.id)),
    [unidades, jaSelecionadas],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return candidatas;
    const numero = digitos(termo);
    return candidatas.filter((u) => {
      if (u.nome.toLowerCase().includes(termo)) return true;
      if (u.cidade?.toLowerCase().includes(termo)) return true;
      // Código casa por dígito: "0123.456" acha "0123456".
      return Boolean(numero) && digitos(u.codigoUc ?? "").includes(numero);
    });
  }, [candidatas, busca]);

  function escolher(u: UnidadeDisponivel) {
    onAdicionar(u);
    setBusca("");
    setAberto(false);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      {/* Base UI usa `render`, não o `asChild` do Radix. */}
      <PopoverTrigger
        render={<Button type="button" variant="outline" size="sm" />}
        disabled={candidatas.length === 0}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar UC
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou código da UC…"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[18rem] overflow-y-auto">
          {filtradas.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {candidatas.length === 0
                ? "Todas as unidades já estão neste rateio."
                : `Nenhuma UC encontrada para “${busca}”.`}
            </p>
          ) : (
            filtradas.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => escolher(u)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left last:border-0 hover:bg-muted"
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{u.nome}</span>
                  {u.isGeradora && (
                    <Badge variant="outline" className="text-[10px]">
                      Geradora
                    </Badge>
                  )}
                  {u.daUsina && (
                    <Badge variant="secondary" className="text-[10px]">
                      Desta usina
                    </Badge>
                  )}
                </span>

                <span className="text-xs text-muted-foreground">
                  {formatCodigoUc(u.codigoUc) ?? "sem código"}
                  {u.cidade ? ` · ${u.cidade}` : ""}
                  {(() => {
                    const c = consumoDaUc(u);
                    return c
                      ? ` · ${c.valor.toLocaleString("pt-BR", {
                          maximumFractionDigits: 0,
                        })} kWh/mês (${c.origem})`
                      : "";
                  })()}
                </span>

                {/* Sem NENHUM dos dois consumos (contrato e faturas) a UC entra
                    no rateio, mas fica de fora da sugestão de percentuais — o
                    aviso é aqui, antes de escolher. */}
                {!u.isGeradora && consumoDaUc(u) === null && (
                  <span className="text-xs text-amber-600">
                    Sem consumo de contrato nem faturas — não entra na sugestão de %
                  </span>
                )}

                {/* O aviso que justifica mostrar tudo em vez de filtrar. */}
                {u.comprometida && (
                  <span className="flex items-start gap-1 text-xs font-medium text-red-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Já recebe {u.comprometida.percentual.toFixed(2).replace(".", ",")}% do
                    rateio {u.comprometida.status === "VIGENTE" ? "vigente" : "pendente"} de{" "}
                    <b>{u.comprometida.plantName}</b>
                  </span>
                )}

                {!u.comprometida && u.usinaCadastro && (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <Factory className="h-3 w-3 shrink-0" />
                    Cadastrada na usina <b>{u.usinaCadastro.name}</b>, sem rateio lá
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {filtradas.length} de {candidatas.length} disponíve
          {candidatas.length === 1 ? "l" : "is"}
        </div>
      </PopoverContent>
    </Popover>
  );
}
