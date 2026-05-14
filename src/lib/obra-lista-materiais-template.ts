// Template fixo da Lista de Materiais (Ordem de Separação – Aluzinco/Perfil)
// da Rede Brasil Solar. Usado para pré-preencher uma nova lista;
// o usuário edita quantidades e especificações na tela antes de gerar o PDF.

export type ListaCategoria =
  | "INVERSOR"
  | "ELETRICO"
  | "ESTRUTURA"
  | "FIXACAO"
  | "AVISOS";

export interface ListaMaterialItemSeed {
  categoria: ListaCategoria;
  descricao: string;
  especificacao: string | null;
  quantidade: string;
}

export const LISTA_CATEGORIAS: {
  value: ListaCategoria;
  label: string;
}[] = [
  { value: "INVERSOR", label: "Inversor e avisos de segurança" },
  { value: "ELETRICO", label: "Elétrico" },
  { value: "ESTRUTURA", label: "Estrutura" },
  { value: "FIXACAO", label: "Fixação" },
  { value: "AVISOS", label: "Avisos e acessórios" },
];

// Baseado no modelo "ORDEM DE SEPARAÇÃO DE MATERIAL – Aluzinco – Perfil"
// da obra ELIANA MARIA DE MIRANDA (14 módulos DHN 620W / SE6000H).
export const LISTA_MATERIAIS_TEMPLATE: ListaMaterialItemSeed[] = [
  // INVERSOR e avisos ---------------------------------------------------------
  { categoria: "INVERSOR", descricao: "Inversor", especificacao: "SolarEdge – SE6000H", quantidade: "1" },
  { categoria: "INVERSOR", descricao: "Módulos", especificacao: "DHN-66Z16-DG-620 (620 W) – DAH SOLAR", quantidade: "14" },
  { categoria: "INVERSOR", descricao: "Otimizadores", especificacao: "S500B", quantidade: "14" },
  { categoria: "INVERSOR", descricao: "Antena", especificacao: "Antena SolarEdge", quantidade: "1" },

  // ELÉTRICO ------------------------------------------------------------------
  { categoria: "ELETRICO", descricao: "DPS CC", especificacao: "1040 Vcc", quantidade: "2" },
  { categoria: "ELETRICO", descricao: "Disjuntor CC", especificacao: "25 A", quantidade: "2" },
  { categoria: "ELETRICO", descricao: "Centro de Distribuição", especificacao: "12 posições", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "Centro de Distribuição", especificacao: "4 posições", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "Disjuntor", especificacao: "1Φ × 32 A", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "DPS", especificacao: "275 Vca", quantidade: "2" },
  { categoria: "ELETRICO", descricao: "Barramento", especificacao: "7 conexões", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "Cabo Fase", especificacao: "6 mm² preto – 750 V", quantidade: "20 m" },
  { categoria: "ELETRICO", descricao: "Cabo Neutro", especificacao: "6 mm² azul – 750 V", quantidade: "20 m" },
  { categoria: "ELETRICO", descricao: "Cabo Aterramento", especificacao: "6 mm² verde – 750 V", quantidade: "20 m" },
  { categoria: "ELETRICO", descricao: "Cabo CC Preto", especificacao: "4 mm² preto", quantidade: "60 m" },
  { categoria: "ELETRICO", descricao: "Cabo CC Vermelho", especificacao: "4 mm² vermelho", quantidade: "60 m" },
  { categoria: "ELETRICO", descricao: "Caixa de Passagem", especificacao: "10 × 10 cm", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "Canaleta/Eletrocalha", especificacao: "30 × 30 mm", quantidade: "1" },
  { categoria: "ELETRICO", descricao: "Par conector MC4", especificacao: null, quantidade: "3" },
  { categoria: "ELETRICO", descricao: "Espiroduto", especificacao: "Metros", quantidade: "1 m" },
  { categoria: "ELETRICO", descricao: "Corrugado", especificacao: "1\"", quantidade: "15 m" },
  { categoria: "ELETRICO", descricao: "Conector parafuso fendidor", especificacao: "10 mm²", quantidade: "2" },

  // ESTRUTURA -----------------------------------------------------------------
  { categoria: "ESTRUTURA", descricao: "Perfil", especificacao: "2,40 metros", quantidade: "14" },
  { categoria: "ESTRUTURA", descricao: "Emendas", especificacao: null, quantidade: "10" },
  { categoria: "ESTRUTURA", descricao: "Grampo lateral", especificacao: "30 mm", quantidade: "16" },
  { categoria: "ESTRUTURA", descricao: "Grampo intermediário", especificacao: null, quantidade: "20" },
  { categoria: "ESTRUTURA", descricao: "Grampo de aterramento", especificacao: null, quantidade: "10" },
  { categoria: "ESTRUTURA", descricao: "Pé em L com vedação", especificacao: null, quantidade: "28" },

  // FIXAÇÃO -------------------------------------------------------------------
  { categoria: "FIXACAO", descricao: "Bucha 6", especificacao: null, quantidade: "12" },
  { categoria: "FIXACAO", descricao: "Parafuso 8", especificacao: null, quantidade: "12" },
  { categoria: "FIXACAO", descricao: "Abraçadeira metálica", especificacao: "1\"", quantidade: "3" },
  { categoria: "FIXACAO", descricao: "Parafuso de emenda", especificacao: null, quantidade: "40" },
  { categoria: "FIXACAO", descricao: "Parafuso autobrocante longo", especificacao: null, quantidade: "28" },
  { categoria: "FIXACAO", descricao: "Parafuso T8", especificacao: null, quantidade: "42" },
  { categoria: "FIXACAO", descricao: "Porca M8", especificacao: null, quantidade: "42" },

  // AVISOS e acessórios -------------------------------------------------------
  { categoria: "AVISOS", descricao: "Placa Advertência", especificacao: "Risco de choque elétrico", quantidade: "2" },
  { categoria: "AVISOS", descricao: "Placa Advertência", especificacao: "Proibido pisar", quantidade: "1" },
  { categoria: "AVISOS", descricao: "Placa Advertência", especificacao: "Desconecte o inversor", quantidade: "1" },
  { categoria: "AVISOS", descricao: "Manual do cliente", especificacao: null, quantidade: "1" },
  { categoria: "AVISOS", descricao: "Lacre do inversor", especificacao: null, quantidade: "2" },
  { categoria: "AVISOS", descricao: "Adesivo de obra", especificacao: null, quantidade: "1" },
];

export function listaCategoriaLabel(c: string): string {
  return LISTA_CATEGORIAS.find((x) => x.value === c)?.label ?? c;
}
