"use client";

/**
 * A fatura de energia como o CLIENTE a vê ao abrir o link do email ou do
 * WhatsApp. Sem login, no domínio da empresa, em vez do checkout do Asaas.
 *
 * 🎨 **Direção "folha de documento"**, escolhida em 06/09/2026 entre três: a
 * fatura é uma folha branca só, como o demonstrativo impresso — extrato com o
 * desconto abatido linha a linha, faixa de economia acumulada e o gráfico de 12
 * meses. O pagamento vem num segundo bloco, deliberadamente separado: o
 * documento explica o valor ANTES de cobrá-lo.
 *
 * A paleta e a tipografia são as do PDF (`demonstrativo-fatura-pdf.tsx`), não
 * uma reinterpretação: mesmo teal, mesmo laranja, mesmo pêssego, Helvetica,
 * rótulos minúsculos em caixa alta com espaçamento. Quem recebeu o PDF por
 * email reconhece a página.
 *
 * PIX e boleto vêm de `components/pagamento/abas-pagamento.tsx`, compartilhado
 * com o pagamento do portal Brasil Solar. Cartão não entra aqui por decisão de
 * 06/09/2026.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import {
  AbaBoleto,
  AbaPix,
  Aviso,
  BORDER,
  INK,
  INK_FAINT,
  INK_SOFT,
  TEAL,
  TEAL_DARK,
} from "@/components/pagamento/abas-pagamento";

/**
 * ESCALA TIPOGRÁFICA — seis tamanhos, e nenhum fora dela.
 *
 * 🔑 A primeira versão desta página tinha DOZE tamanhos, escolhidos um a um no
 * olho: meios-passos sem sentido (8,5 · 9,5 · 12,5) e vizinhos que ninguém
 * distingue (12 e 13, 14 e 15 e 16). Isso não é escala, é decisão repetida —
 * e o resultado é uma página que parece montada por pedaços.
 *
 * Os seis papéis são os mesmos do demonstrativo em PDF, multiplicados por ~1,5:
 * o PDF é denso e impresso em A4, a página é lida a um palmo do rosto no
 * celular. A razão entre os degraus é a de lá.
 *
 *   PDF 6,5–7  → MICRO      rótulo minúsculo em caixa alta
 *   PDF 7,5–8  → APOIO      observação, rodapé, eixo do gráfico
 *   PDF 8,5–10 → CORPO      linhas do extrato, texto corrido
 *   PDF 10–11  → FORTE      nome do cliente, subtotal, botão
 *   PDF 13     → DESTAQUE   economia acumulada
 *   PDF 22     → TOTAL      o valor a pagar
 *
 * ⚠️ Peso é só 400 ou 700 — o react-pdf só tem Helvetica e Helvetica-Bold, e
 * um 600 na página quebraria a correspondência com o documento.
 */
const T = {
  micro: 10,
  apoio: 12,
  corpo: 14,
  forte: 16,
  destaque: 22,
  total: 32,
} as const;

const TEAL_100 = "#D7ECE8";
const PEACH = "#FCE5D5";
const PEACH_INK = "#7A3A14";
const PEACH_LABEL = "#A85427";
const ORANGE = "#EA6E2C";
const LINE_SOFT = "#F3F4F6";
const PAPER_BG = "#E8EDEB";

export interface ResumoFatura {
  custoSemDesconto: number;
  /** Ver `lib/fatura-publica.ts`: quase nunca é verdadeiro. */
  extratoFecha: boolean;
  economiaMes: number;
  economiaAcumulada: number;
  descontoPercentual: number;
  bandeira: string;
  consumoKwh: number;
  creditoRecebidoKwh: number;
  historico: { m: string; consumo: number }[];
}

export interface FaturaView {
  clienteNome: string;
  unidadeConsumidora: string;
  referencia: string;
  valor: number;
  vencimento: string | null;
  situacao: "aberto" | "pago" | "indisponivel";
  temDemonstrativo: boolean;
  resumo: ResumoFatura | null;
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Rótulo minúsculo em caixa alta — o mesmo do PDF. */
function Rotulo({ children, cor = INK_SOFT }: { children: React.ReactNode; cor?: string }) {
  return (
    <div
      style={{
        fontSize: T.micro,
        fontWeight: 700,
        letterSpacing: 1,
        color: cor,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

/** Uma linha do bloco de explicação do valor. */
function Linha({
  rotulo,
  valor,
  cor = INK_SOFT,
  riscado = false,
  forte = false,
}: {
  rotulo: React.ReactNode;
  valor: string;
  cor?: string;
  riscado?: boolean;
  forte?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: `1px solid ${LINE_SOFT}`,
        gap: 12,
      }}
    >
      <span style={{ fontSize: T.corpo, color: "#374151" }}>{rotulo}</span>
      <span
        style={{
          fontSize: T.corpo,
          color: cor,
          fontWeight: forte ? 700 : 400,
          textDecoration: riscado ? "line-through" : "none",
          whiteSpace: "nowrap",
        }}
      >
        {valor}
      </span>
    </div>
  );
}

export default function FaturaPublicaView({
  token,
  inicial,
  empresa,
  suporte,
}: {
  token: string;
  inicial: FaturaView;
  empresa: string;
  suporte: string;
}) {
  const [view, setView] = useState<FaturaView>(inicial);
  const [aba, setAba] = useState<"pix" | "boleto">("pix");
  const apiBase = `/api/fatura/${token}`;

  // PIX e boleto confirmam de forma assíncrona (banco → webhook do Asaas).
  // Enquanto estiver em aberto, pergunta a cada 6s — assim a tela vira "pago"
  // sozinha logo depois do pagamento no app do banco.
  useEffect(() => {
    if (view.situacao !== "aberto") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(apiBase, { cache: "no-store" });
        if (!r.ok) return;
        const nova = (await r.json()) as FaturaView;
        if (nova.situacao === "pago") setView(nova);
      } catch {
        /* silencioso — tenta no próximo tique */
      }
    }, 6000);
    return () => clearInterval(id);
  }, [view.situacao, apiBase]);

  const r = view.resumo;
  const maxConsumo = Math.max(1, ...(r?.historico ?? []).map((h) => h.consumo));

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAPER_BG,
        padding: "20px 14px 26px",
        // 🔤 A MESMA do relatório em PDF, que usa a Helvetica embutida do
        // react-pdf. "Helvetica Neue" saiu de propósito: em Mac e iPhone ela
        // existe e é uma face visivelmente diferente da Helvetica clássica,
        // então a página não batia com o documento justamente em quem abre
        // pelo celular. Arial é metricamente compatível e cobre Windows e
        // Android.
        fontFamily: 'Helvetica, Arial, "Liberation Sans", sans-serif',
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ── A FOLHA ─────────────────────────────────────────────────── */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: 4,
            boxShadow: "0 1px 3px rgba(17,24,39,0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 4,
              background: `linear-gradient(90deg, ${TEAL_DARK} 0%, ${TEAL} 50%, ${ORANGE} 100%)`,
            }}
          />

          <div
            style={{
              padding: "16px 16px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div>
              <Rotulo cor={INK_FAINT}>Demonstrativo de cobrança</Rotulo>
              <div
                style={{
                  fontSize: T.forte,
                  fontWeight: 700,
                  color: INK,
                  textTransform: "uppercase",
                  marginTop: 4,
                  lineHeight: 1.2,
                }}
              >
                {view.clienteNome}
              </div>
              <div style={{ fontSize: T.apoio, color: INK_SOFT, marginTop: 2 }}>
                UC {view.unidadeConsumidora} · {view.referencia}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: T.corpo, fontWeight: 700, color: TEAL_DARK, lineHeight: 1.25 }}>
                {empresa}
              </div>
              <div style={{ fontSize: T.micro, color: INK_FAINT, marginTop: 2 }}>{suporte}</div>
            </div>
          </div>

          {/* O valor como número principal do documento */}
          <div
            style={{
              padding: "18px 16px 16px",
              marginTop: 12,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div>
              <Rotulo>Total a pagar</Rotulo>
              <div style={{ fontSize: T.total, fontWeight: 700, color: TEAL_DARK, lineHeight: 1, marginTop: 5 }}>
                {brl(view.valor)}
              </div>
            </div>
            <div style={{ textAlign: "right", paddingBottom: 3 }}>
              <Rotulo>Vencimento</Rotulo>
              <div style={{ fontSize: T.corpo, fontWeight: 700, color: INK, marginTop: 4 }}>
                {dataBR(view.vencimento)}
              </div>
            </div>
          </div>

          {/* Como o valor se explica.
              ⚠️ Só vira EXTRATO (com o sinal de menos e um total) quando os
              números reconciliam — ver `extratoFecha`. Nas demais regras o
              "sem desconto" e a economia descrevem a mesma realidade por
              caminhos diferentes e não se subtraem; apresentá-los como conta
              faria o cliente somar de cabeça, ver que não bate e desconfiar do
              documento. Aí viram três linhas rotuladas, como os cards do PDF. */}
          {r && (
            <div style={{ padding: "4px 16px 14px" }}>
              <Linha
                rotulo="Custo sem o desconto"
                valor={brl(r.custoSemDesconto)}
                riscado={r.extratoFecha}
              />
              <Linha
                rotulo={
                  <>
                    {r.extratoFecha ? "Desconto do contrato" : "Economia deste mês"}{" "}
                    <span style={{ fontSize: T.apoio, color: INK_FAINT }}>({r.descontoPercentual}%)</span>
                  </>
                }
                /* O "−" é U+2212, não hífen: alinha com os dígitos. */
                valor={`${r.extratoFecha ? "− " : ""}${brl(r.economiaMes)}`}
                cor={ORANGE}
                forte
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0 2px",
                }}
              >
                <span style={{ fontSize: T.corpo, fontWeight: 700, color: INK }}>
                  {r.extratoFecha ? "Você paga" : "Valor desta fatura"}
                </span>
                <span style={{ fontSize: T.forte, fontWeight: 700, color: TEAL_DARK }}>
                  {brl(view.valor)}
                </span>
              </div>
            </div>
          )}

          {/* A economia acumulada, em faixa cheia */}
          {r && r.economiaAcumulada > 0 && (
            <div
              style={{
                background: PEACH,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <Rotulo cor={PEACH_LABEL}>Economia acumulada</Rotulo>
                <div style={{ fontSize: T.destaque, fontWeight: 700, color: PEACH_INK, marginTop: 3 }}>
                  {brl(r.economiaAcumulada)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Rotulo cor={PEACH_LABEL}>Este mês</Rotulo>
                <div style={{ fontSize: T.corpo, fontWeight: 700, color: PEACH_INK, marginTop: 3 }}>
                  {brl(r.economiaMes)}
                </div>
              </div>
            </div>
          )}

          {/* Consumo dos 12 meses — o gráfico do PDF */}
          {r && r.historico.length > 0 && (
            <div style={{ padding: "14px 16px 16px" }}>
              <div style={{ paddingBottom: 5, borderBottom: `1px solid ${BORDER}` }}>
                <Rotulo>Consumo dos últimos 12 meses · kWh</Rotulo>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 62, marginTop: 12 }}>
                {r.historico.map((h, i) => {
                  const ultimo = i === r.historico.length - 1;
                  return (
                    <div
                      key={h.m}
                      title={`${h.m}: ${h.consumo} kWh`}
                      style={{
                        flex: 1,
                        // Piso de 4%: um mês com consumo zero precisa aparecer
                        // como barra rasa, não sumir e virar um buraco no eixo.
                        height: `${Math.max(4, (h.consumo / maxConsumo) * 100)}%`,
                        background: ultimo ? TEAL_DARK : TEAL_100,
                        borderRadius: "2px 2px 0 0",
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: T.micro, color: INK_FAINT }}>{r.historico[0]?.m}</span>
                <span style={{ fontSize: T.micro, fontWeight: 700, color: TEAL_DARK }}>
                  {r.historico[r.historico.length - 1]?.m} · {r.consumoKwh} kWh
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── PAGAMENTO, bloco separado ───────────────────────────────── */}
        {view.situacao === "pago" ? (
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 4,
              boxShadow: "0 1px 3px rgba(17,24,39,0.10)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <CheckCircle2 style={{ width: 40, height: 40, color: TEAL }} />
            <div style={{ fontSize: T.forte, fontWeight: 700, color: TEAL_DARK }}>Pagamento confirmado</div>
            <p style={{ fontSize: T.corpo, color: INK_SOFT, margin: 0, textAlign: "center" }}>
              Recebemos o pagamento desta fatura. Obrigado!
            </p>
          </div>
        ) : view.situacao === "indisponivel" ? (
          <Aviso texto="Esta fatura não está disponível para pagamento no momento. Fale com a gente respondendo o email da cobrança." />
        ) : (
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 4,
              boxShadow: "0 1px 3px rgba(17,24,39,0.10)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ paddingBottom: 5, borderBottom: `1px solid ${BORDER}` }}>
              <Rotulo>Como pagar</Rotulo>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
              {(["pix", "boleto"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAba(k)}
                  style={{
                    padding: "10px 0",
                    borderRadius: 4,
                    fontSize: T.corpo,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${aba === k ? TEAL_DARK : BORDER}`,
                    background: aba === k ? TEAL_DARK : "#FFFFFF",
                    color: aba === k ? "#FFFFFF" : INK_SOFT,
                  }}
                >
                  {k === "pix" ? "PIX" : "Boleto"}
                </button>
              ))}
            </div>

            {aba === "pix" ? (
              <AbaPix apiBase={apiBase} />
            ) : (
              /* O PDF daqui é o NOSSO demonstrativo, que já traz o código de
                 barras impresso — não o boleto avulso do Asaas. É também o que
                 dispensa um segundo botão "ver demonstrativo" na página. */
              <AbaBoleto
                apiBase={apiBase}
                pdfHref={`${apiBase}/demonstrativo`}
                pdfLabel="Baixar demonstrativo com código de barras"
              />
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            marginTop: 2,
          }}
        >
          <ShieldCheck style={{ width: 12, height: 12, color: INK_FAINT }} />
          <span style={{ fontSize: T.apoio, color: INK_FAINT }}>{empresa} · pagamento seguro</span>
        </div>
      </div>
    </div>
  );
}
