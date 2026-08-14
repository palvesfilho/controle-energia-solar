import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-compat";
import { authOptions } from "@/lib/auth-options";
import { canAccessSection } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { marcaInversor } from "@/lib/marca-inversor";
import { chaveCidade, rotuloCidade, ufDaCidade } from "@/lib/cidade-chave";

/**
 * GET /api/brasil-solar/filtros — opções dos dropdowns de filtro da lista.
 *
 * As opções saem da BASE, não de uma lista fixa no código: a lista fixa de
 * plataformas que existia no componente oferecia 14 marcas das quais só 5
 * existem de fato, e escondia qualquer marca nova até alguém lembrar de editar
 * o array. Cada opção vem com a contagem, então o operador vê antes de clicar
 * que "Fronius" tem 1.274 e que não existe DEYE nenhuma.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessSection(session.user.role, "brasilSolar")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [pares, cidades] = await Promise.all([
    prisma.brasilSolarClient.groupBy({
      by: ["inversorMarca", "plataformaMonitoramento"],
      where: { active: true },
      _count: { _all: true },
    }),
    prisma.brasilSolarClient.groupBy({
      by: ["cidade", "uf"],
      where: { active: true },
      _count: { _all: true },
    }),
  ]);

  // Marca EFETIVA (declarada > plataforma), a mesma regra da tag que aparece ao
  // lado do nome na lista. Filtrar por `inversorMarca` cru acharia 78 de 1.918.
  const porMarca = new Map<string, number>();
  for (const p of pares) {
    const { marca } = marcaInversor({
      inversorMarca: p.inversorMarca,
      plataformaMonitoramento: p.plataformaMonitoramento,
    });
    if (!marca) continue;
    porMarca.set(marca, (porMarca.get(marca) ?? 0) + p._count._all);
  }

  const marcas = [...porMarca.entries()]
    .map(([valor, count]) => ({ valor, label: valor, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

  // Uma opção por CHAVE de cidade — as 182 grafias da base viram ~60 cidades.
  const porCidade = new Map<string, { variantes: { valor: string; uf: string | null; count: number }[]; count: number }>();
  for (const c of cidades) {
    const chave = chaveCidade(c.cidade);
    if (!chave) continue;
    const atual = porCidade.get(chave) ?? { variantes: [], count: 0 };
    atual.variantes.push({ valor: c.cidade as string, uf: c.uf, count: c._count._all });
    atual.count += c._count._all;
    porCidade.set(chave, atual);
  }

  const listaCidades = [...porCidade.entries()]
    .map(([valor, { variantes, count }]) => {
      const uf = ufDaCidade(variantes);
      const nome = rotuloCidade(variantes);
      return { valor, label: uf ? `${nome}/${uf}` : nome, count };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const semCidade = cidades
    .filter((c) => !chaveCidade(c.cidade))
    .reduce((acc, c) => acc + c._count._all, 0);

  // Plataforma de monitoramento é OUTRA coisa que a marca do inversor (ver
  // `marca-inversor.ts`) e continua filtrável — só que também pela base.
  const porPlataforma = new Map<string, number>();
  for (const p of pares) {
    const nome = (p.plataformaMonitoramento ?? "").trim();
    if (!nome) continue;
    porPlataforma.set(nome, (porPlataforma.get(nome) ?? 0) + p._count._all);
  }
  const plataformas = [...porPlataforma.entries()]
    .map(([valor, count]) => ({ valor, label: valor, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

  return NextResponse.json({ marcas, cidades: listaCidades, semCidade, plataformas });
}
