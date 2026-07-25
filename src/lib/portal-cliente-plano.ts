/**
 * Estado do plano do proprietário no portal do cliente Brasil Solar (free × pago).
 * Fonte única usada pelo portal real e pela "Visão do cliente", pra as duas
 * telas nunca divergirem em quem vê o dashboard completo × o free-tier.
 */
import { getAcessoValoresTabela } from "@/lib/app-settings";

export interface PlanoPortalAcesso {
  status: string;
  vigenteAte: Date | null;
  conviteToken: string | null;
}

export interface PlanoPortalResolved {
  /** true = acesso pago ATIVO e ainda vigente → dashboard completo + relatórios. */
  planoCompleto: boolean;
  /** Preço exibido no painel de upgrade, ex.: "R$ 39/mês". Vazio quando pago. */
  precoPlanoLabel: string;
  /** Destino do botão "Contratar plano completo" (pagamento branded ou contato). */
  ctaHref: string | null;
}

const brl0 = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

/**
 * Resolve o plano do proprietário:
 *  - `planoCompleto`: acesso pago ATIVO e dentro da vigência;
 *  - `precoPlanoLabel`: valor mensal de tabela (Personalizações) ou "R$ 39/mês";
 *  - `ctaHref`: tela de pagamento branded quando já há cobrança (conviteToken),
 *    senão um contato configurável (`NEXT_PUBLIC_BS_CONTATO_URL`) ou null.
 */
export async function resolvePlanoPortal(
  acesso: PlanoPortalAcesso | null,
): Promise<PlanoPortalResolved> {
  const agora = new Date();
  const planoCompleto =
    acesso?.status === "ATIVO" &&
    (!acesso.vigenteAte || acesso.vigenteAte >= agora);

  // Preço/CTA são calculados sempre (leitura barata) — assim a Visão do cliente
  // pode forçar a prévia do free-tier mesmo pra um proprietário com plano ativo.
  const { mensal } = await getAcessoValoresTabela();
  const precoPlanoLabel = mensal > 0 ? `${brl0(mensal)}/mês` : "R$ 39/mês";
  const ctaHref = acesso?.conviteToken
    ? `/portal-cliente/pagar/${acesso.conviteToken}`
    : process.env.NEXT_PUBLIC_BS_CONTATO_URL ?? null;

  return { planoCompleto, precoPlanoLabel, ctaHref };
}
