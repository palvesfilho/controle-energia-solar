/**
 * Marca do inversor para exibição — regra ÚNICA do sistema.
 *
 * 🔑 **Plataforma de monitoramento ≠ marca do inversor.** Coincidem quase sempre
 * (inversor Fronius → portal Fronius), mas não é garantia: existe inversor de uma
 * marca monitorado por plataforma de outra, e já tivemos o caso ANTUNES (33 kWp)
 * aparecendo com inversor da SPIAZZI (50 kWp).
 *
 * Por isso a regra segue o princípio já estabelecido de que **o operador escolhe e
 * a detecção só confere**: o campo declarado (`inversorMarca`) manda; a plataforma
 * entra só como derivação quando não há declaração; e quando os dois existem e
 * DISCORDAM, a divergência é sinalizada em vez de silenciada.
 *
 * Cobertura real da base em 07/08/2026, que é o motivo de a derivação existir:
 *   BrasilSolarClient.plataformaMonitoramento  1.815 de 1.819  (99,8%)
 *   BrasilSolarProprietario.inversorMarca          10 de 16    (63%)
 *   BrasilSolarClient.inversorMarca                 0 de 1.819 (os 2 "preenchidos" são string vazia)
 *
 * Usar só o campo declarado deixaria praticamente todo cliente sem tag.
 */

export type FonteMarca = "DECLARADA" | "PLATAFORMA";

export interface MarcaInversorInput {
  /** Marca declarada no cadastro (Anexo F / ficha técnica). */
  inversorMarca?: string | null;
  /** Plataforma de monitoramento integrada (FRONIUS, SUNGROW, ...). */
  plataformaMonitoramento?: string | null;
}

export interface MarcaInversorResultado {
  /** Texto pronto pra tag, já capitalizado. `null` = não mostrar tag. */
  marca: string | null;
  /** De onde saiu — a UI usa isso pra diferenciar sólida × contorno. */
  fonte: FonteMarca | null;
  /**
   * `true` quando a marca declarada e a plataforma existem e apontam para
   * fabricantes diferentes. Não muda `marca` (a declarada continua ganhando) —
   * serve pra tag mostrar o aviso.
   */
  divergente: boolean;
  /** Texto do tooltip quando `divergente`. */
  divergenciaDetalhe?: string;
}

/** Minúsculas, sem acento, sem pontuação — para comparar "SolarEdge" com "SOLAREDGE". */
function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas combinantes, igual a normalizeBusca
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Fabricantes conhecidos, na grafia que a marca usa oficialmente. A chave é o
 * nome normalizado; assim "SOLAREDGE", "SolarEdge" e "Solaredge" caem no mesmo.
 * O que não está aqui não é erro — só não tem grafia canônica e é exibido como
 * veio, com a primeira letra maiúscula.
 */
const CANONICO: Record<string, string> = {
  fronius: "Fronius",
  sungrow: "Sungrow",
  solaredge: "SolarEdge",
  huawei: "Huawei",
  growatt: "Growatt",
  solis: "Solis",
  canadian: "Canadian",
  canadiansolar: "Canadian",
  abb: "ABB",
  deye: "Deye",
  hoymiles: "Hoymiles",
  sofar: "Sofar",
  refusol: "RefuSol",
  weg: "WEG",
  sma: "SMA",
};

/** Normaliza a grafia sem perder o que o operador escreveu. */
function exibir(bruto: string): string {
  const k = chave(bruto);
  if (CANONICO[k]) return CANONICO[k];
  const limpo = bruto.trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

/**
 * Chave de deduplicação do nome de uma `EmpresaTerceira`. Preserva os espaços
 * entre palavras (diferente de `chave`, que é para comparar marca) mas ignora
 * caixa e acento: "Solar Sul" e "SOLAR SUL" são a mesma empresa.
 */
export function normalizarNomeEmpresa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** String que conta como preenchida — `""` e espaços não contam. */
function preenchido(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

export function marcaInversor(input: MarcaInversorInput): MarcaInversorResultado {
  const declarada = preenchido(input.inversorMarca);
  const plataforma = preenchido(input.plataformaMonitoramento);

  if (!declarada && !plataforma) {
    return { marca: null, fonte: null, divergente: false };
  }

  if (!declarada) {
    return { marca: exibir(plataforma as string), fonte: "PLATAFORMA", divergente: false };
  }

  const marca = exibir(declarada);
  if (!plataforma) return { marca, fonte: "DECLARADA", divergente: false };

  // Comparação por prefixo nos dois sentidos: "Canadian" × "canadiansolar" é o
  // mesmo fabricante, "Fronius" × "Sungrow" não é.
  const a = chave(declarada);
  const b = chave(plataforma);
  const mesmo = a === b || a.startsWith(b) || b.startsWith(a);

  return {
    marca,
    fonte: "DECLARADA",
    divergente: !mesmo,
    divergenciaDetalhe: mesmo
      ? undefined
      : `Inversor cadastrado como ${marca}, mas o monitoramento integra pela plataforma ${exibir(plataforma)}. Conferir qual está certo.`,
  };
}
