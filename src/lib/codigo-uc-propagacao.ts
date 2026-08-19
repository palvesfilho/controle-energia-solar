/**
 * Propagação do código da UC (novo + antigo) entre o cadastro do PROPRIETÁRIO
 * Brasil Solar e a UNIDADE CONSUMIDORA.
 *
 * 🔑 **Por que existe.** São dois cadastros da mesma pessoa, e só um deles é
 * lido por quem importa: `importarFaturaPdf` casa a fatura com
 * `ConsumerUnit.codigoUc / codigoUcAntigo` e **nunca** olha o proprietário. Só
 * que o campo "código antigo" aparece nas duas telas, e a do proprietário
 * gravava apenas nela mesma — o `POST` copiava os códigos para a UC que ele
 * cria, o `PUT` não copiava nada.
 *
 * Resultado em 19/08/2026: a UC da Suzana Righi mostrava `(antigo: 3092443284)`
 * na tela do proprietário e tinha o campo VAZIO na UC. As 12 faturas de jul/25
 * a jun/26 — impressas com o código pré-migração da RGE — não acharam dono e
 * ficaram órfãs em `bills/_pending/`, sem erro vermelho, só um aviso âmbar
 * "UC não cadastrada". Ver [[project_bs_proprietario_uc_dois_cadastros]].
 *
 * Por isso a propagação corre nos **DOIS sentidos** e pela mesma função: salvar
 * o proprietário sobe para a UC, salvar a UC desce para o proprietário. Meia
 * correção falharia calada de novo —
 * [[feedback_correcao_pela_metade_falha_calada]].
 *
 * ⚠️ **Preenche o que está vazio; nunca sobrescreve valor diferente.** Se os
 * dois lados têm códigos que discordam, alguém decidiu aquilo — o caso vira
 * `ignorados` e quem chamou avisa na tela, em vez de trocar a identidade de uma
 * UC calado ([[feedback_anomalias_sinalizar]]). Trocar `codigoUc` por tabela
 * cruzada é o que o robô e a Infosimples usam pra entrar no portal.
 */
import { prisma } from "./prisma";

export type LadoPropagacao = "UC" | "PROPRIETARIO";

export type CodigoAtualizado = {
  /** Cadastro que RECEBEU o valor. */
  alvo: LadoPropagacao;
  id: string;
  nome: string;
  campo: "codigoUc" | "codigoUcAntigo";
  para: string;
};

export type CodigoIgnorado = {
  alvo: LadoPropagacao;
  id: string | null;
  nome: string | null;
  motivo: string;
};

export type ResultadoPropagacaoCodigo = {
  atualizados: CodigoAtualizado[];
  ignorados: CodigoIgnorado[];
};

const VAZIO: ResultadoPropagacaoCodigo = { atualizados: [], ignorados: [] };

type Par = { codigoUc: string | null; codigoUcAntigo: string | null };

/** Só campos a PREENCHER. Nunca grava `null`: a propagação preenche vazio, não apaga
 *  — e `ConsumerUnit.codigoUc` é obrigatório no schema. */
type Ajuste = Partial<Record<"codigoUc" | "codigoUcAntigo", string>>;

/**
 * Novo tem 12 dígitos, antigo tem 10 — conferido contra o banco em 27/07/2026
 * e é a mesma regra de `formatCodigoUc`. Quando a ficha de origem está com os
 * dois invertidos, propagar espalharia o erro: dois proprietários BS estavam
 * assim (ALEX SANDRO e Jeferson Pires, corrigidos em 19/08/2026).
 */
function invertido(par: Par): boolean {
  return par.codigoUc?.length === 10 && par.codigoUcAntigo?.length === 12;
}

/** Os dois códigos, sem vazios e sem repetição — é por eles que os cadastros se acham. */
function codigosDe(par: Par): string[] {
  return [...new Set([par.codigoUc, par.codigoUcAntigo].filter((c): c is string => !!c))];
}

/**
 * O que falta no destino. Só campo VAZIO é preenchido; campo com valor
 * diferente vira conflito, e campo igual não gera escrita.
 */
function ajuste(origem: Par, destino: Par): { dados: Ajuste; conflitos: string[] } {
  const dados: Ajuste = {};
  const conflitos: string[] = [];

  for (const campo of ["codigoUc", "codigoUcAntigo"] as const) {
    const de = origem[campo];
    const para = destino[campo];
    if (!de || de === para) continue;
    if (!para) {
      dados[campo] = de;
    } else {
      conflitos.push(`${campo}: ${para} × ${de}`);
    }
  }

  return { dados, conflitos };
}

/**
 * Proprietário Brasil Solar → Unidade Consumidora.
 *
 * Chamado ao salvar o proprietário. Idempotente: rodar de novo não muda nada.
 */
export async function propagarCodigosDoProprietario(
  proprietarioId: string,
): Promise<ResultadoPropagacaoCodigo> {
  const prop = await prisma.brasilSolarProprietario.findUnique({
    where: { id: proprietarioId },
    select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
  });
  if (!prop) return VAZIO;

  const codigos = codigosDe(prop);
  if (codigos.length === 0) return VAZIO;

  if (invertido(prop)) {
    return {
      atualizados: [],
      ignorados: [
        {
          alvo: "UC",
          id: null,
          nome: prop.nome,
          motivo: `os códigos do proprietário parecem invertidos (novo ${prop.codigoUc} tem 10 dígitos, antigo ${prop.codigoUcAntigo} tem 12). Nada foi copiado para a Unidade Consumidora.`,
        },
      ],
    };
  }

  // 🔑 Procura pelos DOIS códigos, nos DOIS campos. Cruzar só por `codigoUc`
  // deixa passar exatamente a ficha que está invertida ou incompleta — foi o
  // que escondeu o caso da Suzana numa auditoria anterior.
  const ucs = await prisma.consumerUnit.findMany({
    where: {
      OR: [{ codigoUc: { in: codigos } }, { codigoUcAntigo: { in: codigos } }],
    },
    select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
  });

  if (ucs.length === 0) return VAZIO;
  if (ucs.length > 1) {
    return {
      atualizados: [],
      ignorados: [
        {
          alvo: "UC",
          id: null,
          nome: prop.nome,
          motivo: `os códigos ${codigos.join(" / ")} casam com ${ucs.length} Unidades Consumidoras (${ucs.map((u) => u.nome).join(", ")}). Resolva a duplicidade antes — nada foi alterado.`,
        },
      ],
    };
  }

  return aplicar(prop, ucs[0], "UC", (dados) =>
    prisma.consumerUnit.update({ where: { id: ucs[0].id }, data: dados }),
  );
}

/**
 * Unidade Consumidora → proprietário Brasil Solar.
 *
 * Chamado ao salvar a UC. É o sentido inverso do de cima — sem ele, corrigir o
 * código pela tela da UC deixaria a ficha do proprietário mentindo.
 */
export async function propagarCodigosDaConsumerUnit(
  consumerUnitId: string,
): Promise<ResultadoPropagacaoCodigo> {
  const uc = await prisma.consumerUnit.findUnique({
    where: { id: consumerUnitId },
    select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
  });
  if (!uc) return VAZIO;

  const codigos = codigosDe(uc);
  if (codigos.length === 0) return VAZIO;

  const props = await prisma.brasilSolarProprietario.findMany({
    where: {
      active: true,
      OR: [{ codigoUc: { in: codigos } }, { codigoUcAntigo: { in: codigos } }],
    },
    select: { id: true, nome: true, codigoUc: true, codigoUcAntigo: true },
  });

  if (props.length === 0) return VAZIO;
  if (props.length > 1) {
    return {
      atualizados: [],
      ignorados: [
        {
          alvo: "PROPRIETARIO",
          id: null,
          nome: uc.nome,
          motivo: `os códigos ${codigos.join(" / ")} casam com ${props.length} proprietários Brasil Solar. Nada foi alterado.`,
        },
      ],
    };
  }

  return aplicar(uc, props[0], "PROPRIETARIO", (dados) =>
    prisma.brasilSolarProprietario.update({ where: { id: props[0].id }, data: dados }),
  );
}

async function aplicar(
  origem: Par,
  destino: Par & { id: string; nome: string },
  alvo: LadoPropagacao,
  gravar: (dados: Ajuste) => Promise<unknown>,
): Promise<ResultadoPropagacaoCodigo> {
  const { dados, conflitos } = ajuste(origem, destino);

  const ignorados: CodigoIgnorado[] = conflitos.map((motivo) => ({
    alvo,
    id: destino.id,
    nome: destino.nome,
    motivo: `código divergente entre os dois cadastros (${motivo}) — mantido como estava, corrija à mão qual dos dois vale.`,
  }));

  if (Object.keys(dados).length === 0) return { atualizados: [], ignorados };

  await gravar(dados);

  const atualizados = (Object.entries(dados) as Array<[CodigoAtualizado["campo"], string]>).map(
    ([campo, para]) => ({ alvo, id: destino.id, nome: destino.nome, campo, para }),
  );

  return { atualizados, ignorados };
}

/**
 * Vira as frases que a tela mostra. Só o que o operador precisa ler: o que foi
 * copiado sozinho e o que ficou pendente de decisão dele.
 */
export function avisosDaPropagacao(r: ResultadoPropagacaoCodigo): string[] {
  const onde = (alvo: LadoPropagacao) =>
    alvo === "UC" ? "na Unidade Consumidora" : "no cadastro Brasil Solar";
  const rotulo = (campo: CodigoAtualizado["campo"]) =>
    campo === "codigoUc" ? "código da UC" : "código antigo";

  return [
    ...r.atualizados.map(
      (a) => `O ${rotulo(a.campo)} (${a.para}) também foi gravado ${onde(a.alvo)} de ${a.nome}.`,
    ),
    ...r.ignorados.map((i) => `Atenção: ${i.motivo}`),
  ];
}
