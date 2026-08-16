// Vocabulário comum das exclusões de cadastro (usina, UC). Todas seguem o mesmo
// contrato para que a mesma tela sirva as duas:
//
// bloqueios: histórico financeiro/energético que impede a exclusão. Quando há
//   bloqueio, o caminho é DESATIVAR o cadastro, não apagar.
// avisos: vínculos que a exclusão desfaz sozinha. Não impedem, mas o operador
//   precisa ver antes de confirmar.
//
// ⚠️ Bloqueio NÃO é o mesmo que "o banco recusaria". Na usina os bloqueios são
// relações sem cascade (o Postgres recusaria de qualquer jeito). Na UC várias
// relações são `onDelete: Cascade` — o banco apagaria as faturas caladamente.
// Nesses casos a avaliação aqui é a ÚNICA proteção do histórico.

export interface ImpactoExclusao {
  nome: string;
  bloqueios: string[];
  avisos: string[];
}

export function plural(n: number, singular: string, pluralForma: string) {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}
