"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { brand, brandGradient } from "@/lib/brand-colors";

/**
 * Tour guiado do Portal do Cliente: escurece a tela, destaca um bloco por vez
 * e explica para que ele serve.
 *
 * Os blocos são achados pelo atributo `data-tour="<alvo>"`. Passo cujo bloco
 * não está na tela é pulado — é assim que o mesmo roteiro serve ao plano
 * completo e ao grátis, e a quem não tem o card de avisos ou a faixa de
 * instalação.
 *
 * "Já viu" fica no navegador (decisão do Paulo, 13/10/2026): o tour abre
 * sozinho uma vez por aparelho. O botão "Ver o tour do portal" reabre sempre.
 */

const CHAVE_VISTO = "bs-portal-tour-visto";

/** Espera os cards que dependem do navegador (avisos, instalação) aparecerem. */
const ESPERA_INICIO_MS = 900;
/** Distância do topo da janela em que o bloco destacado é deixado. */
const MARGEM_TOPO = 80;
const FOLGA_DESTAQUE = 6;

interface Passo {
  /** Valor do `data-tour` do bloco. Sem alvo, o balão fica no centro. */
  alvo?: string;
  /** Bloco preso na janela (não rola com a página). */
  fixo?: boolean;
  titulo: string;
  texto: string;
}

const PASSOS: Passo[] = [
  {
    titulo: "Bem-vindo ao seu portal",
    texto:
      "Aqui você acompanha a geração da sua usina solar. Em menos de um minuto mostramos onde fica cada coisa.",
  },
  {
    alvo: "acesso",
    titulo: "Seu plano",
    texto:
      "Este selo mostra qual é o seu plano e, quando houver, até que data o acesso vale.",
  },
  {
    alvo: "numeros",
    titulo: "Geração e economia",
    texto:
      "Os números principais: quanto a usina gerou e a economia estimada, no mês e nos últimos 12 meses.",
  },
  {
    alvo: "geracao",
    titulo: "Gráficos de geração",
    texto:
      "O primeiro gráfico mostra a geração ao longo do dia e se a usina está online. O segundo mostra o total de cada mês. Você pode escolher outro dia ou outro ano.",
  },
  {
    alvo: "plano-completo",
    titulo: "Plano de Acompanhamento",
    texto:
      "Com o plano completo você passa a receber também o relatório mensal da usina e os demais itens desta lista.",
  },
  {
    alvo: "usinas",
    titulo: "Suas usinas",
    texto:
      "As usinas vinculadas ao seu cadastro, com a cidade e a potência instalada. Se faltar alguma, fale com a gente.",
  },
  {
    alvo: "relatorios",
    titulo: "Seus relatórios",
    texto:
      "Todo mês o relatório da sua usina fica disponível aqui. Use o botão Baixar PDF para abrir.",
  },
  {
    alvo: "avisos",
    titulo: "Avisos no celular",
    texto:
      "Por aqui você liga ou desliga os avisos sobre a sua usina neste aparelho.",
  },
  {
    alvo: "instalar",
    fixo: true,
    titulo: "Instale o app",
    texto:
      "O portal pode ficar com ícone na tela do seu celular e abrir direto, sem navegador.",
  },
];

interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

function elementoDe(alvo: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${alvo}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

// O armazenamento pode estar bloqueado (aba anônima, dados do site limpos):
// nesse caso o tour só reaparece, não quebra a tela.
function jaViu(): boolean {
  try {
    return localStorage.getItem(CHAVE_VISTO) === "1";
  } catch {
    return false;
  }
}

function marcarVisto() {
  try {
    localStorage.setItem(CHAVE_VISTO, "1");
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}

export function TourPortalCliente({
  autoIniciar = true,
}: {
  /** false na Visão do cliente: o pós-venda abre pelo botão, nunca sozinho. */
  autoIniciar?: boolean;
}) {
  const [passos, setPassos] = useState<Passo[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState<Retangulo | null>(null);

  const passo = passos?.[indice] ?? null;

  const iniciar = useCallback(() => {
    setRect(null);
    setIndice(0);
    setPassos(PASSOS.filter((p) => !p.alvo || elementoDe(p.alvo)));
  }, []);

  const encerrar = useCallback(() => {
    // Na Visão do cliente não marca: o operador pode usar este mesmo navegador
    // para entrar como cliente, e o tour dele não abriria mais.
    if (autoIniciar) marcarVisto();
    setPassos(null);
  }, [autoIniciar]);

  useEffect(() => {
    if (!autoIniciar || jaViu()) return;
    const t = setTimeout(iniciar, ESPERA_INICIO_MS);
    return () => clearTimeout(t);
  }, [autoIniciar, iniciar]);

  // Leva o bloco do passo para o alto da janela e acompanha a posição dele
  // enquanto a página rola ou muda de tamanho.
  useEffect(() => {
    if (!passo) return;
    const el = passo.alvo ? elementoDe(passo.alvo) : null;
    const medir = () => {
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    if (el && !passo.fixo) {
      window.scrollTo({
        top: window.scrollY + el.getBoundingClientRect().top - MARGEM_TOPO,
        behavior: "smooth",
      });
    }
    const frame = requestAnimationFrame(medir);
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [passo]);

  useEffect(() => {
    if (!passo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") encerrar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [passo, encerrar]);

  const ultimo = passos !== null && indice === passos.length - 1;
  // Bloco na metade de baixo da janela: o balão sobe para não cobri-lo.
  const balaoNoTopo = rect !== null && rect.top > window.innerHeight * 0.45;
  const sombra = "0 0 0 9999px rgba(15, 23, 42, 0.62)";

  return (
    <>
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={iniciar}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#59604F] hover:underline"
        >
          <Compass className="h-3.5 w-3.5" style={{ color: brand.teal }} />
          Ver o tour do portal
        </button>
      </div>

      {passo && passos && (
        <>
          {/* Segura os toques na página enquanto o tour está aberto. */}
          <div className="fixed inset-0 z-[100]" aria-hidden />

          {/* O destaque é um buraco: a sombra enorme escurece todo o resto. */}
          <div
            aria-hidden
            className="fixed z-[101] rounded-xl pointer-events-none"
            style={
              rect
                ? {
                    top: rect.top - FOLGA_DESTAQUE,
                    left: rect.left - FOLGA_DESTAQUE,
                    width: rect.width + FOLGA_DESTAQUE * 2,
                    height: rect.height + FOLGA_DESTAQUE * 2,
                    boxShadow: sombra,
                  }
                : { top: "50%", left: "50%", width: 0, height: 0, boxShadow: sombra }
            }
          />

          <div
            className={`fixed inset-x-0 z-[102] px-4 ${
              rect === null
                ? "top-1/2 -translate-y-1/2"
                : balaoNoTopo
                  ? "top-4"
                  : "bottom-4"
            }`}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tour-portal-titulo"
              className="mx-auto max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5"
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8A938D]">
                {indice + 1} de {passos.length}
              </div>
              <h2
                id="tour-portal-titulo"
                className="mt-1 text-base font-bold text-[#1F1F1F]"
              >
                {passo.titulo}
              </h2>
              <p className="mt-1.5 text-sm text-[#59604F]">{passo.texto}</p>

              <div className="mt-4 flex items-center justify-between gap-3">
                {ultimo ? (
                  <span />
                ) : (
                  <button
                    type="button"
                    onClick={encerrar}
                    className="text-xs font-medium text-[#8A938D] hover:underline"
                  >
                    Pular o tour
                  </button>
                )}
                <div className="flex items-center gap-2">
                  {indice > 0 && (
                    <button
                      type="button"
                      onClick={() => setIndice(indice - 1)}
                      className="rounded-lg border border-[#D7E0DB] px-4 py-2 text-xs font-medium text-[#59604F] transition-colors hover:bg-[#F5F8F7]"
                    >
                      Voltar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={ultimo ? encerrar : () => setIndice(indice + 1)}
                    className="rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: brandGradient }}
                  >
                    {ultimo ? "Concluir" : "Próximo"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
