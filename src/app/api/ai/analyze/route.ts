import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import OpenAI from "openai";
import { isAdminRole } from "@/lib/roles";

const SYSTEM_PROMPT = `Voce e um analista de dados de energia solar. Voce recebe dados brutos extraidos de uma planilha Excel contendo relatorios mensais de usinas solares.

Sua tarefa:
1. MAPEAMENTO: Identifique quais colunas correspondem a quais campos do relatorio:
   - Investidor (nome)
   - Ano, Mes de referencia
   - Resultado Energetico: injecao_periodo (kWh), creditos_anteriores, creditos_utilizados, consumo_instantaneo, auto_consumo_usina, creditos_atuais, creditos_vencer
   - Resultado Financeiro: creditos_utilizados_fin, valor_kwh_contrato (R$/kWh), valor_bruto_gerador (R$), gestao_mensal_fixa (R$), taxa_minima_conc (R$), inadimplencia (R$), multas_outros (R$), remuneracao_periodo (R$)
   - Observacoes

2. EXTRACAO: Extraia os dados de cada linha/investidor e organize em JSON estruturado.

3. VALIDACAO: Para cada registro extraido, valide:
   - valor_bruto_gerador deve ser aproximadamente creditos_utilizados_fin * valor_kwh_contrato
   - remuneracao_periodo deve ser aproximadamente valor_bruto_gerador - gestao_mensal_fixa - taxa_minima_conc - inadimplencia - multas_outros
   - Valores negativos inesperados
   - Campos obrigatorios vazios

Responda SEMPRE em JSON valido com este formato:
{
  "mapping": { "coluna_excel": "campo_sistema", ... },
  "records": [
    {
      "investorName": "string",
      "ano": number,
      "mes": number,
      "injecaoPeriodo": number,
      "creditosAnteriores": number,
      "creditosUtilizados": number,
      "consumoInstantaneo": number,
      "autoConsumoUsina": number,
      "creditosAtuais": number,
      "creditosVencer": number,
      "creditosUtilizadosFin": number,
      "valorKwhContrato": number,
      "valorBrutoGerador": number,
      "gestaoMensalFixa": number,
      "taxaMinimaConc": number,
      "inadimplencia": number,
      "multasOutros": number,
      "remuneracaoPeriodo": number,
      "observacoes": "string ou null"
    }
  ],
  "validations": [
    {
      "recordIndex": number,
      "field": "string",
      "severity": "info" | "warning" | "error",
      "message": "string",
      "suggestedValue": "number ou null"
    }
  ],
  "summary": "string com resumo da analise"
}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY nao configurada" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { sheetsData } = body;

  if (!sheetsData) {
    return NextResponse.json(
      { error: "Dados da planilha necessarios" },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analise os seguintes dados extraidos de uma planilha Excel de relatorio de energia solar:\n\n${JSON.stringify(sheetsData, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "Sem resposta da IA" },
      { status: 500 }
    );
  }

  const analysis = JSON.parse(content);
  return NextResponse.json(analysis);
}
