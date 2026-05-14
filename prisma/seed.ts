import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ─── Admin ───
  await prisma.user.upsert({
    where: { email: "admin@solar.com" },
    update: {},
    create: {
      email: "admin@solar.com",
      name: "Administrador",
      passwordHash: hashSync("admin123", 10),
      role: "ADMIN",
    },
  });
  console.log("Admin criado");

  // ─── 12 Usinas ───
  const plantData = [
    { id: "plant-1",  name: "Usina Solar Viamão",       location: "Viamão, RS",           potMod: 29.97, potInv: 25,   gerMedia: 6100,  enq: "GD 2", uc: "3095464357", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-2",  name: "Usina Solar Canoas",       location: "Canoas, RS",           potMod: 45.00, potInv: 40,   gerMedia: 9200,  enq: "GD 2", uc: "3095512890", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-3",  name: "Usina Solar Gravataí",     location: "Gravataí, RS",         potMod: 18.50, potInv: 15,   gerMedia: 3800,  enq: "GD 2", uc: "3095678123", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-4",  name: "Usina Solar Caxias",       location: "Caxias do Sul, RS",    potMod: 75.00, potInv: 60,   gerMedia: 14500, enq: "GD 2", uc: "4012345678", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-5",  name: "Usina Solar Novo Hamburgo", location: "Novo Hamburgo, RS",   potMod: 33.20, potInv: 30,   gerMedia: 6800,  enq: "GD 2", uc: "3095890456", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-6",  name: "Usina Solar Pelotas",      location: "Pelotas, RS",          potMod: 50.00, potInv: 45,   gerMedia: 10200, enq: "GD 2", uc: "5067891234", conc: "CEEE",  fmt: "MENSAL" },
    { id: "plant-7",  name: "Usina Solar Santa Maria",  location: "Santa Maria, RS",      potMod: 22.00, potInv: 20,   gerMedia: 4500,  enq: "GD 2", uc: "5067234567", conc: "CEEE",  fmt: "MENSAL" },
    { id: "plant-8",  name: "Usina Solar Passo Fundo",  location: "Passo Fundo, RS",      potMod: 60.00, potInv: 50,   gerMedia: 12000, enq: "GD 2", uc: "4012678901", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-9",  name: "Usina Solar Erechim",      location: "Erechim, RS",          potMod: 40.00, potInv: 35,   gerMedia: 8100,  enq: "GD 2", uc: "4012890345", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-10", name: "Usina Solar Bento Gonçalves", location: "Bento Gonçalves, RS", potMod: 28.00, potInv: 25, gerMedia: 5700,  enq: "GD 2", uc: "4012456789", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-11", name: "Usina Solar Lajeado",      location: "Lajeado, RS",          potMod: 15.00, potInv: 12,   gerMedia: 3100,  enq: "GD 2", uc: "3095345678", conc: "RGE",   fmt: "MENSAL" },
    { id: "plant-12", name: "Usina Solar Montenegro",   location: "Montenegro, RS",       potMod: 36.50, potInv: 30,   gerMedia: 7400,  enq: "GD 2", uc: "3095567890", conc: "RGE",   fmt: "MENSAL" },
  ];

  const plants = [];
  for (const p of plantData) {
    const plant = await prisma.plant.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name,
        location: p.location,
        potenciaModulos: p.potMod,
        potenciaInversor: p.potInv,
        geracaoMediaMensal: p.gerMedia,
        enquadramento: p.enq,
        unidadeConsumidora: p.uc,
        concessionaria: p.conc,
        formatoLeitura: p.fmt,
      },
    });
    plants.push(plant);
  }
  console.log(`${plants.length} usinas criadas`);

  // ─── 5 Investidores ───
  const investorData = [
    { email: "spiazzi@solar.com",     name: "Spiazzi Participações",   phone: "(51) 99999-0000", doc: "12.345.678/0001-90" },
    { email: "menegotto@solar.com",   name: "Menegotto Investimentos", phone: "(51) 98877-1234", doc: "23.456.789/0001-01" },
    { email: "rossato@solar.com",     name: "Rossato & Filhos",        phone: "(54) 99765-4321", doc: "34.567.890/0001-12" },
    { email: "dalmagro@solar.com",    name: "Dal Magro Energia",       phone: "(54) 99654-8765", doc: "45.678.901/0001-23" },
    { email: "fontanella@solar.com",  name: "Fontanella Holdings",     phone: "(51) 98543-2109", doc: "56.789.012/0001-34" },
  ];

  const investors = [];
  for (const inv of investorData) {
    const user = await prisma.user.upsert({
      where: { email: inv.email },
      update: {},
      create: {
        email: inv.email,
        name: inv.name,
        passwordHash: hashSync("invest123", 10),
        role: "INVESTOR",
      },
    });
    const investor = await prisma.investor.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        phone: inv.phone,
        document: inv.doc,
      },
    });
    investors.push(investor);
  }
  console.log(`${investors.length} investidores criados`);

  // ─── Vincular investidores às usinas ───
  // Distribuição: alguns investidores têm várias usinas, algumas usinas têm mais de um investidor
  const links = [
    // Spiazzi: 3 usinas
    { inv: 0, plant: 0, share: 100, kwh: 0.63, gestao: 250 },
    { inv: 0, plant: 1, share: 50,  kwh: 0.58, gestao: 300 },
    { inv: 0, plant: 10, share: 100, kwh: 0.65, gestao: 200 },
    // Menegotto: 3 usinas
    { inv: 1, plant: 1, share: 50,  kwh: 0.58, gestao: 300 },
    { inv: 1, plant: 2, share: 100, kwh: 0.60, gestao: 180 },
    { inv: 1, plant: 3, share: 40,  kwh: 0.55, gestao: 350 },
    // Rossato: 3 usinas
    { inv: 2, plant: 3, share: 60,  kwh: 0.55, gestao: 350 },
    { inv: 2, plant: 4, share: 100, kwh: 0.62, gestao: 220 },
    { inv: 2, plant: 5, share: 100, kwh: 0.59, gestao: 280 },
    // Dal Magro: 3 usinas
    { inv: 3, plant: 6, share: 100, kwh: 0.61, gestao: 200 },
    { inv: 3, plant: 7, share: 100, kwh: 0.57, gestao: 400 },
    { inv: 3, plant: 8, share: 100, kwh: 0.60, gestao: 260 },
    // Fontanella: 2 usinas
    { inv: 4, plant: 9,  share: 100, kwh: 0.64, gestao: 230 },
    { inv: 4, plant: 11, share: 100, kwh: 0.61, gestao: 240 },
  ];

  for (const l of links) {
    await prisma.investorPlant.upsert({
      where: {
        investorId_plantId: {
          investorId: investors[l.inv].id,
          plantId: plants[l.plant].id,
        },
      },
      update: {},
      create: {
        investorId: investors[l.inv].id,
        plantId: plants[l.plant].id,
        sharePercent: l.share,
        valorKwhContrato: l.kwh,
        gestaoFixaContrato: l.gestao,
      },
    });
  }
  console.log(`${links.length} vínculos investidor-usina criados`);

  // ─── Relatórios mensais (jan-mar 2026 para todos) ───
  function genReport(base: number) {
    const variation = () => 0.85 + Math.random() * 0.3; // 85%-115%
    return [1, 2, 3].map((mes) => {
      const injecao = Math.round(base * variation());
      const consumo = Math.round(injecao * 0.15 * variation());
      const autoConsumo = Math.round(injecao * 0.65 * variation());
      const creditosAnt = mes === 1 ? Math.round(base * 0.1) : Math.round(base * 0.05 * variation());
      const creditosUtil = injecao + creditosAnt;
      const creditosAt = Math.max(0, Math.round((injecao - consumo - autoConsumo) * 0.3));
      return { mes, injecao, creditosAnt, creditosUtil, consumo, autoConsumo, creditosAt };
    });
  }

  let reportCount = 0;
  for (const l of links) {
    const inv = investors[l.inv];
    const plant = plants[l.plant];
    const baseGen = plant.geracaoMediaMensal ?? 5000;
    const shareMultiplier = (l.share / 100);
    const months = genReport(Math.round(baseGen * shareMultiplier));

    for (const m of months) {
      const creditosUtilFin = m.creditosUtil;
      const valorBruto = Math.round(creditosUtilFin * l.kwh * 100) / 100;
      const remuneracao = Math.round((valorBruto - l.gestao) * 100) / 100;

      await prisma.monthlyReport.upsert({
        where: {
          plantId_investorId_ano_mes: {
            plantId: plant.id,
            investorId: inv.id,
            ano: 2026,
            mes: m.mes,
          },
        },
        update: {},
        create: {
          plantId: plant.id,
          investorId: inv.id,
          ano: 2026,
          mes: m.mes,
          numeroRelatorio: String(m.mes),
          status: "PUBLISHED",
          injecaoPeriodo: m.injecao,
          creditosAnteriores: m.creditosAnt,
          creditosUtilizados: m.creditosUtil,
          consumoInstantaneo: m.consumo,
          autoConsumoUsina: m.autoConsumo,
          creditosAtuais: m.creditosAt,
          creditosVencer: 0,
          creditosUtilizadosFin: creditosUtilFin,
          valorKwhContrato: l.kwh,
          valorBrutoGerador: valorBruto,
          gestaoMensalFixa: l.gestao,
          taxaMinimaConc: 0,
          inadimplencia: 0,
          multasOutros: 0,
          remuneracaoPeriodo: Math.max(0, remuneracao),
          observacoes: m.mes === 1 ? "PAGO - 20/03/2026" : m.mes === 2 ? "PAGO - 18/04/2026" : "PAGO - 20/05/2026",
          publishedAt: new Date(`2026-0${m.mes + 2}-20`),
        },
      });
      reportCount++;
    }
  }
  console.log(`${reportCount} relatórios criados`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
