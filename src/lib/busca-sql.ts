/**
 * Versão server-side da busca de `busca.ts` — mesma regra, feita no Postgres.
 *
 * Por que raw SQL: o `contains` do Prisma com `mode: "insensitive"` resolve
 * caixa, mas **não** resolve acento (`JOAO` não acha `JOÃO`) nem pontuação de
 * documento (o banco grava CPF/código de UC em dígitos, a tela mostra
 * pontuado — colar da tela no filtro não achava nada).
 *
 * Por que `translate()` e não a extensão `unaccent`: `unaccent` está
 * disponível no servidor mas **não instalada**, e instalá-la é uma alteração
 * de infra em produção. `translate()` é builtin, resolve o alfabeto que a base
 * usa (português) e não exige migração. Se um dia a extensão for instalada,
 * basta trocar a expressão em `exprTexto`.
 *
 * O helper devolve só os IDs que casam; a rota continua montando o resto da
 * query no Prisma (filtros, ordenação, paginação, select) com
 * `where.id = { in: ids }`. Assim nenhuma rota precisa virar SQL cru.
 */
import { prisma } from "./prisma";
import { normalizeBusca, somenteDigitos } from "./busca";

/**
 * Acentos que a base usa → letra sem acento. `lower()` roda antes, então só as
 * minúsculas precisam estar na lista.
 */
const DE = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿ";
const PARA = "aaaaaaeeeeiiiiooooouuuucnyy";

/** Identificador de tabela/coluna aceito — barra injeção via nome de coluna. */
const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Teto de IDs devolvidos: evita montar um `IN (...)` gigante numa busca vaga. */
const LIMITE_PADRAO = 5000;

function assertIdent(nome: string, papel: string): string {
  if (!IDENT.test(nome)) {
    throw new Error(`Nome de ${papel} inválido para busca: ${nome}`);
  }
  return `"${nome}"`;
}

/** `translate(lower(coalesce(col,'')), acentos, sem_acento)` */
function exprTexto(col: string): string {
  return `translate(lower(coalesce(${col}, '')), '${DE}', '${PARA}')`;
}

/** Só os dígitos da coluna — casa documento/código independente da pontuação. */
function exprDigitos(col: string): string {
  return `regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;
}

/** Mesmo critério de `busca.ts`: termo numérico casa também dígito a dígito. */
function ehTermoNumerico(token: string): boolean {
  return /\d/.test(token) && /^[\d.\-/()\s]+$/.test(token);
}

/**
 * Neutraliza os curingas do LIKE. Sem isso, quem digita "50%" casa com a base
 * inteira e quem digita "_" idem — do lado do cliente esses caracteres sao
 * literais, entao o servidor tem que se comportar igual.
 */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface BuscaSqlOpts {
  /** Nome da tabela no banco (snake_case do `@@map`), ex.: `brasil_solar_clients`. */
  tabela: string;
  /** Colunas pesquisadas, no nome do banco (`cpf_cnpj`, `codigo_uc`, ...). */
  colunas: string[];
  /** Termo digitado pelo operador. */
  termo: string;
  /** Coluna de chave primária devolvida (padrão `id`). */
  colunaId?: string;
  /** Teto de resultados (padrão 5000). */
  limite?: number;
}

/**
 * Devolve os IDs da tabela que casam com o termo.
 *
 * Semântica idêntica à de `matchBusca`: **E** entre as palavras digitadas,
 * **OU** entre as colunas. Termo vazio devolve `null` — sinal de "não filtre",
 * para a rota não confundir com "nenhum resultado".
 */
export async function buscarIds(opts: BuscaSqlOpts): Promise<string[] | null> {
  const termo = (opts.termo || "").trim();
  if (!termo) return null;

  const tabela = assertIdent(opts.tabela, "tabela");
  const colunaId = assertIdent(opts.colunaId ?? "id", "coluna");
  const colunas = opts.colunas.map((c) => assertIdent(c, "coluna"));
  if (colunas.length === 0) return null;

  const tokens = termo.split(/\s+/).filter(Boolean);
  const params: string[] = [];
  const condicoes: string[] = [];

  for (const token of tokens) {
    const alvos: string[] = [];

    const texto = normalizeBusca(token);
    if (texto) {
      params.push(`%${escaparLike(texto)}%`);
      const p = `$${params.length}`;
      alvos.push(...colunas.map((c) => `${exprTexto(c)} LIKE ${p} ESCAPE '\\'`));
    }

    if (ehTermoNumerico(token)) {
      const digitos = somenteDigitos(token);
      if (digitos) {
        params.push(`%${digitos}%`);
        const p = `$${params.length}`;
        alvos.push(...colunas.map((c) => `${exprDigitos(c)} LIKE ${p} ESCAPE '\\'`));
      }
    }

    // Token sem texto e sem dígito não deveria existir (o split já filtra
    // vazios), mas se acontecer ele não pode virar um `()` inválido.
    if (alvos.length === 0) continue;
    condicoes.push(`(${alvos.join(" OR ")})`);
  }

  if (condicoes.length === 0) return null;

  const limite = Math.max(1, opts.limite ?? LIMITE_PADRAO);
  const sql =
    `SELECT ${colunaId} AS id FROM ${tabela} ` +
    `WHERE ${condicoes.join(" AND ")} LIMIT ${limite}`;

  const linhas = await prisma.$queryRawUnsafe<{ id: string }[]>(sql, ...params);
  return linhas.map((l) => l.id);
}
