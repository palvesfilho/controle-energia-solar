/**
 * Seed inicial da base de conhecimento de códigos de erro de inversor.
 *
 * Lista CURADA — cobre os erros mais comuns reportados em campo pelos 4 fabricantes
 * que a Brasil Solar monitora. NÃO é exaustiva. O time deve refinar/ampliar pela
 * tela /admin/personalizacoes/codigos-erro-inversor conforme aparecem novos códigos
 * em alertas reais.
 *
 * Idempotente: usa upsert por (fabricante, codigo). Re-rodar não duplica.
 *
 * Uso: npx tsx scripts/seed-inverter-error-kb.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Acao = {
  ordem: number;
  descricao: string;
  acaoRequerida:
    | "IR_EM_CAMPO"
    | "VERIFICAR_REMOTO"
    | "CONTATAR_CLIENTE"
    | "CONTATAR_CONCESSIONARIA"
    | "MONITORAR";
};

type Codigo = {
  fabricante: "FRONIUS" | "SOLAREDGE" | "SUNGROW" | "HUAWEI";
  codigo: string;
  titulo: string;
  descricao?: string;
  severidadeSugerida?: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  acoes: Acao[];
};

const SEEDS: Codigo[] = [
  // ============================================================
  // FRONIUS — State Codes mais comuns (rede / DC / proteção)
  // Doc: https://www.fronius.com (manual de cada inversor)
  // ============================================================
  {
    fabricante: "FRONIUS",
    codigo: "102",
    titulo: "Tensão DC fora da faixa",
    descricao: "Tensão CC dos painéis fora da janela de operação do inversor.",
    severidadeSugerida: "MEDIA",
    acoes: [
      { ordem: 1, descricao: "Verificar irradiação solar — pode ser período noturno ou nublado.", acaoRequerida: "MONITORAR" },
      { ordem: 2, descricao: "Inspecionar strings em campo: conectores MC4, isolamento, sombreamento.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "103",
    titulo: "Subtensão CA — Rede fora da faixa (baixa)",
    descricao: "Tensão da rede da concessionária abaixo do limite operacional do inversor.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar a concessionária pra reportar tensão baixa no ponto de conexão.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Avaliar inversão de fase: religar o inversor em outra fase pode resolver desequilíbrio local.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 3, descricao: "Verificar dimensionamento do ramal de entrada (cabos, disjuntor) — queda de tensão excessiva.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "105",
    titulo: "Sobretensão CA — Rede fora da faixa (alta)",
    descricao: "Tensão da rede acima do limite operacional. Pode indicar ramal subdimensionado ou problema na concessionária.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar a concessionária — solicitar medição de tensão e ajuste do TAP do transformador.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Avaliar substituição/reforço dos cabos do ramal entre o quadro e o inversor.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 3, descricao: "Verificar parametrização da curva Volt-Var/Volt-Watt do inversor (Prodist módulo 3).", acaoRequerida: "VERIFICAR_REMOTO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "106",
    titulo: "Frequência CA baixa",
    descricao: "Frequência da rede abaixo de 57,5 Hz — geralmente problema na concessionária.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária — anomalia na rede de distribuição.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Aguardar normalização da rede; o inversor reconecta automaticamente.", acaoRequerida: "MONITORAR" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "107",
    titulo: "Frequência CA alta",
    descricao: "Frequência da rede acima de 62 Hz.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária — anomalia na rede.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Aguardar normalização.", acaoRequerida: "MONITORAR" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "108",
    titulo: "Ilhamento detectado",
    descricao: "Inversor detectou possível operação em ilha (sem rede). Anti-ilhamento atuou.",
    severidadeSugerida: "MEDIA",
    acoes: [
      { ordem: 1, descricao: "Confirmar com concessionária se houve interrupção/manutenção no ponto de conexão.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Se persistente sem queda de luz, verificar instalação de proteções (relé de ilhamento).", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "301",
    titulo: "Sobrecorrente CA",
    descricao: "Pico de corrente no lado CA acima do nominal. Pode indicar curto-circuito ou falha interna.",
    severidadeSugerida: "CRITICA",
    acoes: [
      { ordem: 1, descricao: "Visita técnica imediata: inspecionar cabeamento CA, conexões e quadro de proteção.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Se reincidente, abrir RMA com a Fronius — pode ser falha do estágio de potência.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "304",
    titulo: "Erro DC",
    descricao: "Falha no lado CC: polaridade invertida, isolamento ou conexão.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar polaridade dos strings, conectores MC4 e cabeamento DC.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Medir resistência de isolamento dos painéis.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "401",
    titulo: "Falha de comunicação",
    descricao: "Inversor não está enviando dados pro Solar.web. Pode ser Wi-Fi/cabo ou módulo Datamanager.",
    severidadeSugerida: "MEDIA",
    acoes: [
      { ordem: 1, descricao: "Verificar status do roteador no local com o cliente.", acaoRequerida: "CONTATAR_CLIENTE" },
      { ordem: 2, descricao: "Acessar o inversor por IP local na rede do cliente pra checar configuração de rede.", acaoRequerida: "VERIFICAR_REMOTO" },
      { ordem: 3, descricao: "Reset do Datamanager em campo se persistente.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "FRONIUS",
    codigo: "567",
    titulo: "Falha de impedância da rede",
    descricao: "Impedância da rede fora dos limites — geralmente sinaliza problema no ramal de conexão.",
    severidadeSugerida: "MEDIA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária pra avaliação do ponto de entrega.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Verificar conexões no quadro do cliente — apertos, oxidação.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },

  // ============================================================
  // SOLAREDGE — Códigos mais comuns
  // ============================================================
  {
    fabricante: "SOLAREDGE",
    codigo: "0x39",
    titulo: "Falha de isolamento",
    descricao: "Resistência de isolamento DC abaixo do limite de segurança.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar painéis pra umidade, conectores danificados ou cabos com isolamento comprometido.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Medir resistência de isolamento string a string.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SOLAREDGE",
    codigo: "0x3A",
    titulo: "Falha de RCD (corrente de fuga)",
    descricao: "Corrente residual detectada acima do limite. Risco elétrico.",
    severidadeSugerida: "CRITICA",
    acoes: [
      { ordem: 1, descricao: "Visita técnica imediata: medir corrente de fuga e inspecionar isolamento.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Verificar conexões dos otimizadores P-series.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SOLAREDGE",
    codigo: "0x3B",
    titulo: "Tensão CA fora da faixa",
    descricao: "Tensão da rede fora dos limites operacionais.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária pra reportar tensão fora da faixa.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Verificar conexões CA do inversor e dimensionamento dos cabos.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SOLAREDGE",
    codigo: "0x3C",
    titulo: "Frequência CA fora da faixa",
    descricao: "Frequência da rede fora de 60 ± 2 Hz.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária — anomalia na rede.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Aguardar normalização da rede.", acaoRequerida: "MONITORAR" },
    ],
  },
  {
    fabricante: "SOLAREDGE",
    codigo: "0x46",
    titulo: "Temperatura interna alta",
    descricao: "Inversor superaquecendo — derate ou shutdown térmico.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar ventilação do local de instalação: limpar dissipadores, verificar exposição ao sol.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Verificar se há obstrução nas grelhas do inversor.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SOLAREDGE",
    codigo: "0x47",
    titulo: "Falha de comunicação",
    descricao: "Inversor offline no monitoring portal.",
    severidadeSugerida: "MEDIA",
    acoes: [
      { ordem: 1, descricao: "Verificar status da internet no local com o cliente.", acaoRequerida: "CONTATAR_CLIENTE" },
      { ordem: 2, descricao: "Reset do gateway de comunicação (cellular/Ethernet) em campo.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },

  // ============================================================
  // SUNGROW — Códigos mais comuns
  // ============================================================
  {
    fabricante: "SUNGROW",
    codigo: "002",
    titulo: "Tensão da rede fora da faixa",
    descricao: "Tensão CA fora dos limites configurados.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária pra avaliação da tensão no ponto.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Verificar dimensionamento do ramal CA.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SUNGROW",
    codigo: "003",
    titulo: "Frequência da rede fora da faixa",
    descricao: "Frequência CA fora de 60 ± 2 Hz.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Aguardar normalização — inversor reconecta sozinho.", acaoRequerida: "MONITORAR" },
    ],
  },
  {
    fabricante: "SUNGROW",
    codigo: "004",
    titulo: "Perda de rede",
    descricao: "Sem detecção de tensão CA — desligamento da concessionária ou disjuntor aberto.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Confirmar com cliente se houve queda de luz no local.", acaoRequerida: "CONTATAR_CLIENTE" },
      { ordem: 2, descricao: "Verificar disjuntor do inversor / ramal CA em campo.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SUNGROW",
    codigo: "010",
    titulo: "Tensão PV alta",
    descricao: "Tensão CC dos strings acima do limite máximo do inversor.",
    severidadeSugerida: "CRITICA",
    acoes: [
      { ordem: 1, descricao: "Visita técnica: revisar configuração das strings (módulos em série acima do projetado).", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SUNGROW",
    codigo: "014",
    titulo: "Falha de isolamento",
    descricao: "Resistência de isolamento DC abaixo do limite.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar painéis e cabeamento CC pra umidade/ruptura de isolamento.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "SUNGROW",
    codigo: "015",
    titulo: "Corrente de fuga",
    descricao: "Corrente residual detectada acima do limite seguro.",
    severidadeSugerida: "CRITICA",
    acoes: [
      { ordem: 1, descricao: "Visita técnica imediata: medir corrente de fuga.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },

  // ============================================================
  // HUAWEI — FusionSolar
  // ============================================================
  {
    fabricante: "HUAWEI",
    codigo: "2001",
    titulo: "Perda de rede",
    descricao: "Sem detecção de tensão na rede — concessionária ou disjuntor.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Confirmar com cliente se há energia no local.", acaoRequerida: "CONTATAR_CLIENTE" },
      { ordem: 2, descricao: "Verificar disjuntor CA do inversor.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2002",
    titulo: "Subtensão CA",
    descricao: "Tensão da rede abaixo do limite.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Avaliar mudança de fase do inversor.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2003",
    titulo: "Sobretensão CA",
    descricao: "Tensão da rede acima do limite.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária pra ajuste do TAP do transformador.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
      { ordem: 2, descricao: "Reforçar cabeamento CA se queda de tensão for excessiva.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2004",
    titulo: "Subfrequência",
    descricao: "Frequência da rede abaixo de 57,5 Hz.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2005",
    titulo: "Sobrefrequência",
    descricao: "Frequência da rede acima de 62 Hz.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Acionar concessionária.", acaoRequerida: "CONTATAR_CONCESSIONARIA" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2011",
    titulo: "Resistência de isolamento PV baixa",
    descricao: "Falha de isolamento detectada no lado CC.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar isolamento dos cabos e módulos CC.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2031",
    titulo: "Inversão de fase no cabeamento",
    descricao: "Erro na sequência de fases CA. Não dá pra operar.",
    severidadeSugerida: "CRITICA",
    acoes: [
      { ordem: 1, descricao: "Visita técnica: corrigir sequência de fases no quadro.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
  {
    fabricante: "HUAWEI",
    codigo: "2061",
    titulo: "Superaquecimento interno",
    descricao: "Temperatura interna acima do limite — derate térmico ou shutdown.",
    severidadeSugerida: "ALTA",
    acoes: [
      { ordem: 1, descricao: "Inspecionar ventilação e dissipadores em campo.", acaoRequerida: "IR_EM_CAMPO" },
      { ordem: 2, descricao: "Avaliar exposição direta ao sol e necessidade de sombreamento da carcaça.", acaoRequerida: "IR_EM_CAMPO" },
    ],
  },
];

async function main() {
  console.log(`Iniciando seed de ${SEEDS.length} códigos de erro...`);
  let criados = 0;
  let atualizados = 0;

  for (const seed of SEEDS) {
    const existing = await prisma.inverterErrorCode.findUnique({
      where: {
        fabricante_codigo: { fabricante: seed.fabricante, codigo: seed.codigo },
      },
    });

    if (existing) {
      // Atualiza header e regrava ações em ordem.
      await prisma.inverterErrorCode.update({
        where: { id: existing.id },
        data: {
          titulo: seed.titulo,
          descricao: seed.descricao,
          severidadeSugerida: seed.severidadeSugerida,
        },
      });
      await prisma.inverterErrorAction.deleteMany({
        where: { errorCodeId: existing.id },
      });
      await prisma.inverterErrorAction.createMany({
        data: seed.acoes.map((a) => ({
          errorCodeId: existing.id,
          ordem: a.ordem,
          descricao: a.descricao,
          acaoRequerida: a.acaoRequerida,
        })),
      });
      atualizados++;
    } else {
      await prisma.inverterErrorCode.create({
        data: {
          fabricante: seed.fabricante,
          codigo: seed.codigo,
          titulo: seed.titulo,
          descricao: seed.descricao,
          severidadeSugerida: seed.severidadeSugerida,
          acoes: {
            create: seed.acoes.map((a) => ({
              ordem: a.ordem,
              descricao: a.descricao,
              acaoRequerida: a.acaoRequerida,
            })),
          },
        },
      });
      criados++;
    }
  }

  console.log(`Seed concluído. Criados: ${criados}. Atualizados: ${atualizados}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
