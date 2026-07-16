import { NextRequest, NextResponse } from "next/server";
import { pagarCartaoDaCobranca } from "@/lib/portal-cobranca";
import { AsaasError } from "@/lib/asaas";

// POST /api/portal/cobranca/[token]/cartao — checkout transparente de cartão.
// Rota PÚBLICA (ver proxy.ts). Recebe os dados do cartão capturados na nossa
// tela e paga a cobrança pendente no Asaas. Nada de cartão é gravado por nós.
// Body: { cartao: {holderName,number,expiryMonth,expiryYear,ccv},
//         titular: {name,email,cpfCnpj,postalCode,addressNumber,phone,...} }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await req.json().catch(() => null);

  const cartao = body?.cartao;
  const titular = body?.titular;
  if (!cartao || !titular) {
    return NextResponse.json(
      { error: "Dados do cartão ou do titular ausentes." },
      { status: 400 },
    );
  }

  // IP do comprador (exigido pela análise antifraude do Asaas). Atrás do proxy
  // do Railway, o IP real vem no x-forwarded-for (primeiro da lista).
  const fwd = req.headers.get("x-forwarded-for") || "";
  const remoteIp = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";

  try {
    const result = await pagarCartaoDaCobranca({ token, cartao, titular, remoteIp });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AsaasError) {
      // Erros de cartão (recusado, dados inválidos) chegam como 4xx do Asaas —
      // repassamos a mensagem tratada pro cliente entender o motivo.
      console.error("[portal/cartao] Asaas:", e.status, e.body);
      return NextResponse.json(
        { error: e.message || "Pagamento não autorizado. Verifique os dados do cartão." },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : "Erro ao processar o pagamento.";
    console.error("[portal/cartao] erro:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
